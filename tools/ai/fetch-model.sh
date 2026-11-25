#!/bin/sh
# 노래방 AI 모델을 「ai-model」 공개 릴리스에서 받아, tools/ai/model.json의 지문과 맞을 때만 넣는다.
# 쓰는 법: GH_TOKEN=... sh tools/ai/fetch-model.sh <넣을 자리>
set -e
dest="$1"
want=$(jq -r .sha256 tools/ai/model.json)
name=$(jq -r .file tools/ai/model.json)
rel=$(jq -r .release tools/ai/model.json)
repo="${GITHUB_REPOSITORY:-sysoppark-oss/onum}"
id=$(gh api "repos/$repo/releases/tags/$rel" --jq ".assets[] | select(.name==\"$name\") | .id")
mkdir -p "$(dirname "$dest")"
gh api -H "Accept: application/octet-stream" "repos/$repo/releases/assets/$id" > "$dest.part"
got=$(sha256sum "$dest.part" | cut -d' ' -f1)
if [ "$got" != "$want" ]; then echo "::error::노래방 AI 모델 지문이 달라요($got)"; rm -f "$dest.part"; exit 1; fi
mv "$dest.part" "$dest"
echo "노래방 AI 모델 넣음: $dest ($(wc -c < "$dest") bytes, sha256 ${got%"${got#????????}"}…)"
