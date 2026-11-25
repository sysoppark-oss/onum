"""ONNX 파일 크기 줄이기(계산 결과는 그대로).

1) STFT·역STFT의 sin/cos 표(2049×4096, 4개, 134MB)를 파일에 적지 않고, 모델을 열 때 계산하는 작은 식으로 바꾼다.
2) 1MB 넘는 float64 상수는 float32로 적고 열 때 float64로 되돌린다.
쓰는 법: python shrink.py 입력.onnx 출력.onnx
"""
import sys
import numpy as np
import onnx
from onnx import helper, numpy_helper, TensorProto

src, dst = sys.argv[1], sys.argv[2]
m = onnx.load(src)
g = m.graph
NF, NB = 4096, 2049

def c(name, arr):
    return helper.make_node('Constant', [], [name], value=numpy_helper.from_array(arr, name + '_v'), name=name)

new_nodes, common_done = [], False
def common():
    """n(0..4095), k(0..2048)로 (k*n mod 4096)·2π/4096 각도와 한 창(hann)을 만든다"""
    p = '__stftk_'
    ns = [
        c(p + 'n', np.arange(NF, dtype=np.int64).reshape(1, NF)),
        c(p + 'k', np.arange(NB, dtype=np.int64).reshape(NB, 1)),
        c(p + 'mod', np.array(NF, dtype=np.int64)),
        c(p + 'step', np.array(2 * np.pi / NF, dtype=np.float32)),
        helper.make_node('Mul', [p + 'k', p + 'n'], [p + 'kn']),
        helper.make_node('Mod', [p + 'kn', p + 'mod'], [p + 'knm']),
        helper.make_node('Cast', [p + 'knm'], [p + 'knf'], to=TensorProto.FLOAT),
        helper.make_node('Mul', [p + 'knf', p + 'step'], [p + 'ang']),
        helper.make_node('Cos', [p + 'ang'], [p + 'cos']),
        helper.make_node('Sin', [p + 'ang'], [p + 'sin']),
        helper.make_node('Cast', [p + 'n'], [p + 'nf'], to=TensorProto.FLOAT),
        helper.make_node('Mul', [p + 'nf', p + 'step'], [p + 'wa']),
        helper.make_node('Cos', [p + 'wa'], [p + 'wc']),
        c(p + 'half', np.array(0.5, dtype=np.float32)),
        helper.make_node('Mul', [p + 'wc', p + 'half'], [p + 'wch']),
        helper.make_node('Sub', [p + 'half', p + 'wch'], [p + 'win']),
        helper.make_node('Mul', [p + 'cos', p + 'win'], [p + 'cw']),
        helper.make_node('Mul', [p + 'sin', p + 'win'], [p + 'sw']),
        c(p + 'shape', np.array([NB, 1, NF], dtype=np.int64)),
    ]
    return ns

replaced, f64 = 0, 0
p = '__stftk_'
out_nodes = []
for n in g.node:
    if n.op_type == 'Constant' and n.attribute and n.attribute[0].t.ByteSize() > 0:
        arr = numpy_helper.to_array(n.attribute[0].t)
        if arr.shape == (NB, 1, NF) and arr.dtype == np.float32:
            if not common_done:
                out_nodes += common(); common_done = True
            K = arr[:, 0, :].astype(np.float64)
            win = 0.5 - 0.5 * np.cos(2 * np.pi * np.arange(NF) / NF)
            ang = 2 * np.pi * ((np.arange(NB)[:, None] * np.arange(NF)[None, :]) % NF) / NF
            best = None
            for trig, base in (('cw', np.cos(ang) * win), ('sw', np.sin(ang) * win)):
                # 줄마다 배수 a_k: K = a_k * base (base가 0인 줄은 0)
                num = (K * base).sum(1); den = (base * base).sum(1)
                a = np.where(den > 1e-12, num / np.maximum(den, 1e-12), 0.0)
                err = np.abs(a[:, None] * base - K).max()
                if best is None or err < best[0]: best = (err, trig, a)
            err, trig, a = best
            assert err < 1e-5, (n.output[0], err)
            o = n.output[0]
            out_nodes += [
                c(o + '__a', a.astype(np.float32).reshape(NB, 1)),
                helper.make_node('Mul', [p + trig, o + '__a'], [o + '__k']),
                helper.make_node('Reshape', [o + '__k', p + 'shape'], [o]),
            ]
            replaced += 1
            continue
        if arr.dtype == np.float64 and arr.nbytes > 1_000_000:
            o = n.output[0]
            out_nodes += [c(o + '__f32', arr.astype(np.float32)), helper.make_node('Cast', [o + '__f32'], [o], to=TensorProto.DOUBLE)]
            f64 += 1
            continue
    out_nodes.append(n)
del g.node[:]
g.node.extend(out_nodes)
print('stft tables replaced', replaced, 'float64 consts shrunk', f64)
assert replaced == 4, replaced
onnx.save(m, dst)
onnx.checker.check_model(dst)
