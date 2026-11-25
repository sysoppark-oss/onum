"""노래방 AI 목소리 분리 모델 만들기 (GitHub Actions 「노래방 AI 모델 만들기」에서 돈다).

Meta가 MIT 라이선스로 공개한 HTDemucs(4갈래: drums, bass, other, vocals) 공식 가중치를
ONNX로 바꾼 뒤, 가중치만 16비트로 줄여(계산은 32비트 그대로) 앱 크기를 반으로 줄인다.
입력 mix [1, 2, 343980] (44.1kHz 스테레오 7.8초), 출력 stems [1, 4, 2, 343980].
"""
import hashlib, json, sys, time
from pathlib import Path
import numpy as np
import onnx
from onnx import helper, numpy_helper, TensorProto
import onnxruntime as ort

out = Path(sys.argv[1] if len(sys.argv) > 1 else 'out'); out.mkdir(exist_ok=True)
fp32 = out / 'htdemucs_fp32.onnx'

from demucs_onnx.export import export_to_onnx
export_to_onnx('htdemucs', fp32)  # 원본과 맞는지(parity) 검사한 뒤에만 쓴다

# 가중치만 fp16으로: 큰 float32 상수를 float16으로 저장하고 Cast로 되돌린다
m = onnx.load(str(fp32))
g = m.graph
casts = []
for init in g.initializer:
    if init.data_type != TensorProto.FLOAT: continue
    a = numpy_helper.to_array(init)
    if a.size < 1024: continue
    name = init.name
    h = numpy_helper.from_array(a.astype(np.float16), name + '__f16')
    init.CopyFrom(h)
    casts.append(helper.make_node('Cast', [name + '__f16'], [name], to=TensorProto.FLOAT, name=name + '__cast'))
for n in reversed(casts): g.node.insert(0, n)
small = out / 'htdemucs.onnx'
onnx.save(m, str(small))
onnx.checker.check_model(str(small))

# 두 모델을 같은 입력으로 돌려 차이를 본다(소리 크기 1 기준)
rng = np.random.default_rng(0)
t = np.arange(343980) / 44100
x = (0.3 * np.sin(2 * np.pi * 220 * t) + 0.05 * rng.standard_normal(343980)).astype(np.float32)
mix = np.stack([x, np.roll(x, 50)])[None]
o = ort.SessionOptions(); o.intra_op_num_threads = 4
a = ort.InferenceSession(str(fp32), o).run(['stems'], {'mix': mix})[0]
t0 = time.time()
b = ort.InferenceSession(str(small), o).run(['stems'], {'mix': mix})[0]
dt = time.time() - t0
diff = float(np.abs(a - b).max())
print('shape', b.shape, 'max diff fp32 vs fp16w', diff, f'one chunk {dt:.2f}s on CI CPU')
assert b.shape == (1, 4, 2, 343980)
assert diff < 2e-2, diff

sha = hashlib.sha256(small.read_bytes()).hexdigest()
info = {'file': 'htdemucs.onnx', 'sha256': sha, 'bytes': small.stat().st_size,
        'source': 'facebookresearch/demucs htdemucs (MIT)', 'exporter': 'demucs-onnx 0.3.4 (MIT)',
        'sr': 44100, 'segment': 343980, 'stems': ['drums', 'bass', 'other', 'vocals'],
        'input': 'mix', 'output': 'stems', 'weights': 'fp16, computed in fp32'}
(out / 'model.json').write_text(json.dumps(info, indent=1))
print(json.dumps(info, indent=1))
fp32.unlink()
