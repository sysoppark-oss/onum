#!/bin/sh
# 안드로이드 쪽(자바·설정·플러그인)이 바뀌었는지 가리는 지문. 같으면 화면 부분만 바꿔 끼워도 된다.
{
  find android/app/src/main -type f -not -path '*/assets/*' | LC_ALL=C sort | xargs sha1sum
  sha1sum android/app/build.gradle android/variables.gradle android/build.gradle
  node -e "const l=require('./package-lock.json').packages;for(const k of Object.keys(l).filter(k=>/^node_modules\/@(capacitor|capgo)\//.test(k)).sort())console.log(k,l[k].version)"
} | sha1sum | cut -c1-12
