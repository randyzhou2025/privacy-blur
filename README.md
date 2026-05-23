# PrivacyBlur

PrivacyBlur 是一个浏览器本地运行的隐私打码 MVP。图片只进入当前页面内存，不上传服务器，不保存历史记录，不调用云端 OCR 或云端大模型。

## 本地开发

```bash
npm install
npm run prepare:ocr
npm run dev
```

打开 Vite 输出的本地地址后即可使用。

## Docker 部署

这个项目是纯前端静态应用，线上不需要启动后端服务。Docker 镜像会先构建前端，再用 Nginx 托管 `dist/`。

本机或服务器直接运行：

```bash
docker compose up -d --build
```

默认访问：

```text
http://服务器IP:3030/
```

如果要挂到 `https://qiway.site/privacy-blur/`，可以让外层 Nginx 反代到容器：

```nginx
location = /privacy-blur {
    return 301 /privacy-blur/;
}

location ^~ /privacy-blur/ {
    proxy_pass http://127.0.0.1:3030/;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}
```

部署后建议检查这些资源是否能正常访问：

```text
http://服务器IP:3030/ocr/worker.min.js
http://服务器IP:3030/ocr/tesseract-core-lstm.wasm.js
http://服务器IP:3030/tessdata/chi_sim.traineddata.gz
http://服务器IP:3030/tessdata/eng.traineddata.gz
```

如果挂在 `https://qiway.site/privacy-blur/`，对应检查：

```text
https://qiway.site/privacy-blur/ocr/worker.min.js
https://qiway.site/privacy-blur/ocr/tesseract-core-lstm.wasm.js
https://qiway.site/privacy-blur/tessdata/chi_sim.traineddata.gz
https://qiway.site/privacy-blur/tessdata/eng.traineddata.gz
```

## 设计开发准则

用户体验优先是后续设计、开发、审查和测试的第一准则。每次改动都要从真实使用路径检查：选择图片后是否马上看到图片，常用操作是否就近出现，手机端是否顺手，是否容易误触，导出前是否清楚知道哪些区域会被写入新图片。

## 代码托管原则

项目代码必须进入独立 Git 仓库，并推送到匹配项目名的 GitHub 远端：

```text
git@github.com:randyzhou2025/privacy-blur.git
```

源代码、文档、配置、脚本和必要的本地运行资源需要提交；`node_modules`、构建产物、缓存和本机私有配置默认不提交。

OCR worker、WASM 和语言包由 npm 依赖在本地或 Docker 构建阶段生成，不直接进入 Git，避免服务器拉取源码时下载大体积二进制文件。

## 本地离线包

生产构建使用相对资源路径，便于把 `dist/` 打包成可下载的本地版。离线包需要包含 `dist/index.html`、`dist/assets/`、`dist/ocr/`、`dist/tessdata/` 和 `LOCAL_RUN_README.txt`。用户解压后可打开 `index.html` 使用；手机系统对本地网页、OCR worker 和 WASM 的限制不完全一致，如本地 OCR 被系统拦截，仍可使用在线入口，图片不会上传服务器。

生成本地下载包：

```bash
npm run package:local
```

脚本会生成 `release/privacyblur-local.zip`。这个 zip 是发布产物，不进入 Git；上线时把它上传到服务器静态目录，例如 `/var/www/downloads/privacyblur-local.zip`，主页下载按钮指向 `/downloads/privacyblur-local.zip`。

## MVP 功能

- 上传 PNG / JPG / WebP 图片并在本地 Canvas 预览。
- 鼠标或触控拖拽创建遮挡框，支持移动、边角缩放、删除。
- 本地 Tesseract OCR 识别文字，识别前会在本地适度放大并增强文字对比度。
- 规则匹配手机号、邮箱、身份证号、银行卡号疑似、订单号疑似、金额疑似、姓名疑似、地址疑似。
- OCR 结果以候选遮挡框加入画布，用户可删除或调整。
- 导出时用离屏 Canvas 重新编码 PNG，把纯色或马赛克遮挡写入新图片中。

## 隐私边界

- 不使用第三方统计 SDK。
- 不写入 `localStorage`、IndexedDB 或历史记录。
- OCR worker、wasm 和语言包来自项目本地 `public/` 目录。
- 导出图片为重新编码的新文件，默认不保留原图 EXIF。
