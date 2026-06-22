# 公開・更新手順

## 接続先

- ローカル: `C:\Users\kayo\Documents\Codex\2026-06-20\new-chat\outputs\akasen-board-mobile`
- GitHub: `ecamig28-pixel/akasen-board-mobile`
- 公開: GitHub の `main` ブランチに接続済みの Vercel

`main` のファイルを更新すると Vercel が自動で再公開する。通常は1〜2分待ち、スマホではアプリを完全に閉じて開き直して確認する。

## Codexで更新するとき

1. ローカルのファイルを修正する。
2. `start.cmd` または `py -m http.server 8766 --bind 127.0.0.1` で起動する。
3. スマホ幅（目安 `412 × 915`）で、画像読込・描画・移動・サイズ変更・共有を確認する。
4. JavaScriptのエラーがないことを確認する。
5. PWAのキャッシュを確実に更新したい変更では、`sw.js` の `CACHE_NAME` を `v4` → `v5` のように1つ上げる。
6. ローカルでは変更をコミットして履歴を残す。
7. 公開側は GitHub コネクターを使い、対象ファイルごとに次を行う。
   - `github_fetch_file` で `main` 上の現在の blob SHA を取得
   - `github_update_file` にファイル全文・取得した SHA・`branch: main` を渡す
   - 同じファイルへの更新は並列実行しない
8. GitHub上の内容を再取得して反映を確認する。Vercelの自動公開を待つ。

## この環境での注意

- ローカルGitの履歴と、GitHubコネクターで作られたリモート履歴は一致していない。
- 通常の `git push` は Git Credential Manager の認証待ちで止まることがあるため、現状は公開に使わない。
- GitHubへ送るのは変更対象のファイルだけ。認証情報やスクリーンショットはアップロードしない。
- PWAは古いキャッシュが残る場合がある。反映されないときは、スマホで一度完全終了して再度開く。

## 主な公開ファイル

- `index.html`
- `styles.css`
- `app.js`
- `sw.js`
- `manifest.webmanifest`
- `icon.svg`
- `README.md`


