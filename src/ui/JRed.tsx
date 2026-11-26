// 말씀에서 예수님을 가리키는 낱말만 빨간 글자로(굵기는 그대로). 조사가 붙어도 낱말 부분만 칠한다.
// 「주」「인자」「아들」은 다른 뜻으로도 쓰여 넣지 않는다.
import type { ReactNode } from 'react'

const RE = /(예수|그리스도|메시아|메시야|임마누엘|어린 양|Jesus|Christ(?!ian)|Messiah|Immanuel|イエス|キリスト|メシア|耶稣|耶穌|基督|弥赛亚|Иисус(?:а|у|ом|е)?(?![а-яё])|Христ(?:ос|а|у|ом|е)(?![а-яё])|Мессия|यीशु|मसीह)/g

export function jred(text: string): ReactNode {
  const parts = text.split(RE)
  if (parts.length === 1) return text
  return parts.map((p, i) => (i % 2 ? <span key={i} className="jred">{p}</span> : p))
}
