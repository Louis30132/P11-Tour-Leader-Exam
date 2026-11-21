# -*- coding: utf-8 -*-
"""產生 App 圖示（綠底白色旗幟＋勾勾，領隊舉旗的意象）。"""
import pathlib
from PIL import Image, ImageDraw

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / 'app' / 'icons'
OUT.mkdir(parents=True, exist_ok=True)

for size in (192, 512):
    s = size / 512
    img = Image.new('RGB', (size, size), (31, 111, 92))
    d = ImageDraw.Draw(img)
    # 旗桿
    d.rounded_rectangle([150 * s, 110 * s, 172 * s, 410 * s], radius=10 * s, fill='white')
    # 旗面
    d.polygon([(172 * s, 116 * s), (380 * s, 160 * s), (172 * s, 250 * s)], fill='white')
    # 勾勾
    d.line([(220 * s, 330 * s), (265 * s, 372 * s), (360 * s, 280 * s)], fill=(255, 214, 102), width=int(30 * s), joint='curve')
    img.save(OUT / f'icon-{size}.png')
    print('icon', size)
