#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
tts-matcha-worker.py —— sherpa-onnx · Matcha-zh(baker) 单句合成常驻子进程
======================================================================
由 scripts/gen-tts-audio.mjs 的 `--provider local` 分支以子进程方式驱动：

协议：
  启动参数固定模型与运行配置（只加载一次模型，服务 stdin 上的逐句任务）；
  每行从 stdin 读取一条 JSON 请求：
      {"wav": "<绝对路径/临时wav>", "text": "<待合成句子>"}
  每完成一句，向 stdout 输出一行 JSON 应答（flush）：
      成功：{"wav": "<路径>", "ok": true}
      失败：{"wav": "<路径>", "ok": false, "error": "<原因>"}
  收到 EOF（stdin 关闭）后进程退出。

说明：合成产物为 22050Hz 单声道 PCM-16 wav；后续 mp3 转码（24kHz 单声道
32kbps）由 node 侧 ffmpeg-static 完成。模型与运行时仅属开发期依赖。
"""

import argparse
import json
import sys

import sherpa_onnx
import soundfile as sf


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--acoustic-model", required=True, help="Matcha acoustic model onnx")
    parser.add_argument("--vocoder", required=True, help="vocoder onnx")
    parser.add_argument("--lexicon", required=True, help="lexicon.txt")
    parser.add_argument("--tokens", required=True, help="tokens.txt")
    parser.add_argument("--rule-fsts", default="", help="逗号分隔的 phone/date/number fst")
    parser.add_argument("--num-threads", type=int, default=4)
    parser.add_argument("--speaker-id", type=int, default=0)
    args = parser.parse_args()

    # Windows 下保证 stdin/stdout 按 UTF-8 解析（node 侧按 utf8 读写）
    for stream in (sys.stdin, sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8")
        except Exception:
            pass

    tts_config = sherpa_onnx.OfflineTtsConfig(
        model=sherpa_onnx.OfflineTtsModelConfig(
            matcha=sherpa_onnx.OfflineTtsMatchaModelConfig(
                acoustic_model=args.acoustic_model,
                vocoder=args.vocoder,
                lexicon=args.lexicon,
                tokens=args.tokens,
            ),
            provider="cpu",
            debug=False,
            num_threads=args.num_threads,
        ),
        rule_fsts=args.rule_fsts,
        max_num_sentences=1,
    )
    if not tts_config.validate():
        sys.stderr.write("ERROR: tts_config.validate() failed\n")
        sys.stderr.flush()
        sys.exit(1)

    tts = sherpa_onnx.OfflineTts(tts_config)
    gen_config = sherpa_onnx.GenerationConfig()
    gen_config.sid = args.speaker_id
    gen_config.speed = 1.0
    gen_config.silence_scale = 0.2

    out = sys.stdout
    for raw in sys.stdin:
        line = raw.strip()
        if not line:
            continue
        req = json.loads(line)
        wav_path = req["wav"]
        text = req["text"]
        try:
            audio = tts.generate(text, gen_config)
            if audio is None or len(audio.samples) == 0:
                raise RuntimeError("empty audio samples")
            sf.write(wav_path, audio.samples, samplerate=audio.sample_rate, subtype="PCM_16")
            out.write(json.dumps({"wav": wav_path, "ok": True}, ensure_ascii=False) + "\n")
        except Exception as err:  # noqa: BLE001 —— 单句失败不应拖垮整批任务
            try:
                import os

                if os.path.exists(wav_path):
                    os.remove(wav_path)
            except Exception:
                pass
            out.write(json.dumps({"wav": wav_path, "ok": False, "error": str(err)}, ensure_ascii=False) + "\n")
        out.flush()


if __name__ == "__main__":
    main()
