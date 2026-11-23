// 어디로 배포한 판인가. 스토어 판은 스토어가 업데이트를 맡으므로
// 앱 안의 「새 판 확인·받기」(GitHub 시험판)를 모두 끈다.
const CH = import.meta.env.VITE_STORE as string | undefined
export const STORE = CH === 'galaxy' || CH === 'onestore'
export const GALAXY_URL = 'https://galaxystore.samsung.com/detail/org.onum.player'
export const ONESTORE_URL = 'https://onesto.re/0001013333'
export const STORE_URL = CH === 'onestore' ? ONESTORE_URL : GALAXY_URL
export const TEST_APK_URL = 'https://github.com/sysoppark-oss/onum/releases/download/test-build/onum-test.apk'
/** 시험판 APK 주소를 이 판에 맞는 받는 곳으로 바꾼다(번역된 글 안의 주소도 함께) */
export const getUrl = (s: string) => (STORE ? s.split(TEST_APK_URL).join(STORE_URL) : s)
