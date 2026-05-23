from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import textwrap


WIDTH = 1080
HEIGHT = 1440
OUT_DIR = Path(__file__).resolve().parent / "output"
FONT_REGULAR = "/System/Library/Fonts/Hiragino Sans GB.ttc"
FONT_MEDIUM = "/System/Library/Fonts/STHeiti Medium.ttc"


def font(size, bold=False):
    return ImageFont.truetype(FONT_MEDIUM if bold else FONT_REGULAR, size)


def text_size(draw, text, fnt):
    box = draw.textbbox((0, 0), text, font=fnt)
    return box[2] - box[0], box[3] - box[1]


def rounded(draw, box, radius, fill, outline=None, width=1):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def shadow_panel(base, box, radius=42, fill=(255, 255, 255), shadow=(31, 41, 55, 28)):
    layer = Image.new("RGBA", base.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    offset = 18
    d.rounded_rectangle((box[0], box[1] + offset, box[2], box[3] + offset), radius=radius, fill=shadow)
    layer = layer.filter(ImageFilter.GaussianBlur(18))
    base.alpha_composite(layer)
    d = ImageDraw.Draw(base)
    d.rounded_rectangle(box, radius=radius, fill=fill)


def draw_wrapped(draw, text, xy, fnt, fill, max_width, line_gap=12):
    x, y = xy
    lines = []
    current = ""
    for char in text:
        trial = current + char
        if text_size(draw, trial, fnt)[0] <= max_width:
            current = trial
        else:
            if current:
                lines.append(current)
            current = char
    if current:
        lines.append(current)
    for line in lines:
        draw.text((x, y), line, font=fnt, fill=fill)
        y += text_size(draw, line, fnt)[1] + line_gap
    return y


def badge(draw, xy, text, fill, fg, stroke=None):
    x, y = xy
    fnt = font(30, True)
    w, h = text_size(draw, text, fnt)
    box = (x, y, x + w + 38, y + h + 22)
    rounded(draw, box, 24, fill, stroke, 2 if stroke else 1)
    draw.text((x + 19, y + 9), text, font=fnt, fill=fg)
    return box[2]


def check_icon(draw, box, fill=(20, 184, 166), stroke=(255, 255, 255)):
    rounded(draw, box, 18, fill, None)
    x1, y1, x2, y2 = box
    draw.line(
        [
            (x1 + 13, y1 + 27),
            (x1 + 22, y1 + 36),
            (x2 - 13, y1 + 16),
        ],
        fill=stroke,
        width=6,
        joint="curve",
    )


def base_canvas(bg_top=(248, 253, 250), bg_bottom=(237, 247, 255)):
    img = Image.new("RGBA", (WIDTH, HEIGHT), bg_top)
    px = img.load()
    for y in range(HEIGHT):
        ratio = y / HEIGHT
        r = int(bg_top[0] * (1 - ratio) + bg_bottom[0] * ratio)
        g = int(bg_top[1] * (1 - ratio) + bg_bottom[1] * ratio)
        b = int(bg_top[2] * (1 - ratio) + bg_bottom[2] * ratio)
        for x in range(WIDTH):
            px[x, y] = (r, g, b, 255)
    d = ImageDraw.Draw(img)
    for x in range(0, WIDTH, 54):
        d.line((x, 0, x, HEIGHT), fill=(15, 23, 42, 14), width=1)
    for y in range(0, HEIGHT, 54):
        d.line((0, y, WIDTH, y), fill=(15, 23, 42, 14), width=1)
    return img


def footer(draw, page):
    draw.text((72, 1348), "PrivacyBlur", font=font(34, True), fill=(15, 118, 110))
    draw.text((300, 1356), "图片不上传 · 本地处理 · 导出已打码新图", font=font(26), fill=(71, 85, 105))
    draw.text((930, 1348), page, font=font(34, True), fill=(148, 163, 184))


def title(draw, main, sub=None, y=110):
    draw.text((72, y), main, font=font(78, True), fill=(15, 23, 42))
    next_y = y + 108
    if sub:
        next_y = draw_wrapped(draw, sub, (76, next_y), font(36), (71, 85, 105), 900, 14)
    return next_y


def cover():
    img = base_canvas((247, 252, 249), (233, 246, 255))
    d = ImageDraw.Draw(img)
    badge(d, (72, 78), "发图前先看一眼", (220, 252, 231), (15, 118, 110), (94, 234, 212))
    draw_wrapped(d, "别急着发截图", (72, 164), font(88, True), (15, 23, 42), 920, 8)
    draw_wrapped(d, "这 8 处可能正在暴露你", (76, 284), font(48, True), (185, 28, 28), 900, 8)

    shadow_panel(img, (86, 410, 994, 1128), 52, (255, 255, 255, 248))
    d = ImageDraw.Draw(img)
    rounded(d, (134, 470, 946, 1068), 36, (248, 250, 252), (203, 213, 225), 2)
    d.text((178, 520), "订单截图 / 聊天截图 / 快递单", font=font(38, True), fill=(30, 41, 59))
    sample_lines = [
        ("收件人：王小小", "姓名"),
        ("手机：138 0000 1234", "手机号"),
        ("地址：上海市 XX 区 XX 路 88 号", "地址"),
        ("订单号：XHS202605230001", "订单号"),
        ("实付：￥268.00", "金额"),
    ]
    y = 606
    for text, label in sample_lines:
        d.text((180, y), text, font=font(34), fill=(51, 65, 85))
        tw, th = text_size(d, text, font(34))
        rounded(d, (176, y - 6, 188 + tw, y + th + 12), 10, (239, 68, 68, 58), (220, 38, 38), 2)
        rounded(d, (690, y - 4, 842, y + 48), 18, (254, 226, 226), (248, 113, 113), 2)
        d.text((720, y + 5), label, font=font(28, True), fill=(153, 27, 27))
        y += 86
    rounded(d, (186, 968, 894, 1026), 24, (15, 118, 110), None)
    d.text((245, 980), "用 PrivacyBlur 发图前 10 秒自检", font=font(32, True), fill=(255, 255, 255))
    footer(d, "1/5")
    return img


def risk_list():
    img = base_canvas()
    d = ImageDraw.Draw(img)
    title(d, "很多人漏遮的", "不是只有手机号，下面这些也经常暴露身份和住址。")
    items = [
        ("手机号 / 邮箱", "能被直接联系"),
        ("姓名 / 昵称 / 头像", "能关联到真实身份"),
        ("收货地址", "能暴露小区、楼栋、门牌"),
        ("订单号 / 快递单号", "可能查到交易或物流"),
        ("身份证号 / 银行卡号", "高风险敏感信息"),
        ("金额 / 支付截图", "暴露消费和交易关系"),
        ("二维码 / 条形码", "可能含账号或订单信息"),
        ("车牌 / 学校 / 公司", "暴露行踪和关系圈"),
    ]
    x, y = 78, 330
    for idx, (left, right) in enumerate(items, 1):
        row_y = y + (idx - 1) * 102
        rounded(d, (x, row_y, 1002, row_y + 76), 24, (255, 255, 255, 238), (226, 232, 240), 2)
        rounded(d, (x + 22, row_y + 16, x + 72, row_y + 66), 16, (254, 226, 226), None)
        d.text((x + 38, row_y + 20), str(idx), font=font(26, True), fill=(185, 28, 28))
        d.text((x + 96, row_y + 18), left, font=font(32, True), fill=(15, 23, 42))
        d.text((x + 548, row_y + 22), right, font=font(28), fill=(100, 116, 139))
    rounded(d, (78, 1190, 1002, 1272), 30, (236, 253, 245), (94, 234, 212), 2)
    d.text((118, 1210), "收藏这张：以后发图前照着检查一遍", font=font(34, True), fill=(15, 118, 110))
    footer(d, "2/5")
    return img


def auto_detect():
    img = base_canvas((249, 250, 251), (240, 253, 250))
    d = ImageDraw.Draw(img)
    title(d, "自动找隐私文字", "本地 OCR 只负责提示，最终由你确认和调整。")

    steps = [
        ("上传图片", "图片只进入当前浏览器"),
        ("本地 OCR", "不调用云端识别接口"),
        ("生成候选框", "手机号、地址、订单号等"),
        ("人工确认", "头像/二维码/车牌仍要自己看"),
    ]
    for i, (name, desc) in enumerate(steps):
        top = 348 + i * 174
        rounded(d, (90, top, 990, top + 112), 30, (255, 255, 255, 242), (203, 213, 225), 2)
        rounded(d, (124, top + 28, 184, top + 88), 20, (204, 251, 241), None)
        d.text((143, top + 39), str(i + 1), font=font(30, True), fill=(15, 118, 110))
        d.text((220, top + 22), name, font=font(38, True), fill=(15, 23, 42))
        d.text((220, top + 70), desc, font=font(28), fill=(100, 116, 139))
        if i < len(steps) - 1:
            d.line((540, top + 120, 540, top + 158), fill=(20, 184, 166), width=5)
            d.polygon([(528, top + 152), (552, top + 152), (540, top + 170)], fill=(20, 184, 166))

    chips = ["手机号", "邮箱", "身份证号", "订单号", "地址", "金额", "姓名"]
    cx, cy = 90, 1080
    for chip in chips:
        end_x = badge(d, (cx, cy), chip, (255, 247, 237), (180, 83, 9), (253, 186, 116))
        cx = end_x + 16
        if cx > 900:
            cx, cy = 90, cy + 72
    footer(d, "3/5")
    return img


def local_safety():
    img = base_canvas((248, 250, 252), (239, 246, 255))
    d = ImageDraw.Draw(img)
    title(d, "更安全的版本", "担心上传？可以下载到本地，解压后打开页面使用。")

    shadow_panel(img, (92, 350, 988, 1050), 46, (15, 23, 42, 248), (15, 23, 42, 34))
    d = ImageDraw.Draw(img)
    d.text((150, 430), "PrivacyBlur 本地包", font=font(54, True), fill=(255, 255, 255))
    d.text((154, 505), "约 40MB · 内含 OCR 资源", font=font(32), fill=(203, 213, 225))
    checks = [
        "图片不上传服务器",
        "不保存历史记录",
        "不调用云端 OCR / 云端大模型",
        "包含页面、脚本、WASM、中英文语言包",
        "导出的是已经打码的新图片",
    ]
    y = 610
    for item in checks:
        check_icon(d, (154, y + 3, 202, y + 51))
        d.text((228, y), item, font=font(34, True), fill=(241, 245, 249))
        y += 82

    rounded(d, (134, 1122, 946, 1236), 34, (236, 253, 245), (94, 234, 212), 2)
    d.text((178, 1148), "PC/安卓：解压后打开 index.html", font=font(36, True), fill=(15, 118, 110))
    d.text((178, 1195), "手机若限制本地文件，在线版同样本地处理图片", font=font(26), fill=(71, 85, 105))
    footer(d, "4/5")
    return img


def how_to_use():
    img = base_canvas((255, 251, 235), (240, 253, 250))
    d = ImageDraw.Draw(img)
    title(d, "发图前这样用", "适合晒快递、聊天截图、订单、票据、报名信息。")

    cards = [
        ("01", "选择图片", "PNG / JPG / WebP，图片只在本机浏览器处理"),
        ("02", "点自动查找", "先找到文字里的手机号、地址、订单号等候选"),
        ("03", "手动补充", "头像、二维码、车牌、学校名等自己再框一下"),
        ("04", "导出新图", "遮挡会写入新图片，不只是页面上盖一层"),
    ]
    y = 336
    for num, head, body in cards:
        rounded(d, (72, y, 1008, y + 154), 34, (255, 255, 255, 240), (226, 232, 240), 2)
        d.text((118, y + 44), num, font=font(42, True), fill=(15, 118, 110))
        d.text((230, y + 28), head, font=font(42, True), fill=(15, 23, 42))
        draw_wrapped(d, body, (230, y + 86), font(28), (100, 116, 139), 710, 6)
        y += 188

    rounded(d, (72, 1124, 1008, 1276), 42, (15, 118, 110), None)
    d.text((126, 1152), "关注我：继续做免费本地小工具", font=font(42, True), fill=(255, 255, 255))
    d.text((126, 1212), "收藏这篇，发图前当隐私检查清单用", font=font(30), fill=(204, 251, 241))
    footer(d, "5/5")
    return img


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    cards = [
        ("01_cover_privacyblur.png", cover()),
        ("02_privacy_risk_checklist.png", risk_list()),
        ("03_auto_detect_features.png", auto_detect()),
        ("04_local_offline_safety.png", local_safety()),
        ("05_how_to_use_cta.png", how_to_use()),
    ]
    for name, img in cards:
        img.convert("RGB").save(OUT_DIR / name, quality=95)
    print(f"generated {len(cards)} cards in {OUT_DIR}")


if __name__ == "__main__":
    main()
