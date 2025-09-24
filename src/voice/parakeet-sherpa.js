// sherpa-onnx Parakeet (NeMo) transcription (Node.js with native bindings)
// Requires: npm i sherpa-onnx-node decompress decompress-tarbz2
// Model bundle: a folder containing tokens.txt and model.onnx (or model.int8.onnx)
// Example bundle (download per docs):
//   https://k2-fsa.github.io/sherpa/onnx/pretrained_models/offline-ctc/nemo/english.html
// Usage:
//   node parakeet-sherpa.mjs --bundle ./parakeet --file ./sample.wav
//   node parakeet-sherpa.mjs --bundle ./parakeet --mic --seconds 5

import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { spawn } from 'node:child_process'
import readline from 'node:readline'
import { createRequire } from 'node:module'
import decompress from 'decompress'
import decompressTarbz2 from 'decompress-tarbz2'
const require = createRequire(import.meta.url)
const sherpa_onnx = require('sherpa-onnx-node')

class ParakeetSherpaApp {
  constructor(argv) {
    this.argv = argv
    this.getFlag = (name) => this.argv.includes(name)
    this.getOpt = (name, def) => {
      const i = this.argv.indexOf(name)
      return i !== -1 && i + 1 < this.argv.length ? this.argv[i + 1] : def
    }
    this.bundleDir = undefined
    this.recognizer = undefined
  }

  async run() {
    await this.initBundleDir()
    await this.initRecognizer()
    if (this.getFlag('--loop')) {
      await this.runLoop()
      return
    }
    const stream = this.recognizer.createStream()
    await this.feedAudio(stream)
    this.recognizer.decode(stream)
    const result = this.recognizer.getResult(stream)
    const text = result && typeof result === 'object' ? result.text : String(result)
    console.log(text)
  }

  async initBundleDir() {
    let bundleDir = this.getOpt('--bundle')
    if (!bundleDir) {
      bundleDir = await ensureParakeetBundle()
      console.log(`Using downloaded bundle at: ${bundleDir}`)
    }
    this.bundleDir = bundleDir
  }

  async initRecognizer() {
    const { tokens, encoder, decoder, joiner, ctcModel } = await findExistingModelFiles(this.bundleDir)
    if (encoder && decoder && joiner) {
      await logStat('tokens', tokens)
      await logStat('encoder', encoder)
      await logStat('decoder', decoder)
      await logStat('joiner', joiner)
      const config = {
        featConfig: { sampleRate: 16000, featureDim: 80 },
        modelConfig: {
          transducer: { encoder, decoder, joiner },
          tokens,
          numThreads: Number(this.getOpt('--threads', '2')),
          provider: 'cpu',
          debug: 1,
          modelType: 'nemo_transducer',
        },
      }
      this.recognizer = new sherpa_onnx.OfflineRecognizer(config)
      return
    }

    if (ctcModel) {
      await logStat('tokens', tokens)
      await logStat('ctc-model', ctcModel)
      const config = {
        featConfig: { sampleRate: 16000, featureDim: 80 },
        modelConfig: {
          nemoCtc: { model: ctcModel },
          tokens,
          numThreads: Number(this.getOpt('--threads', '2')),
          provider: 'cpu',
          debug: 1,
          modelType: 'nemo_ctc',
        },
      }
      this.recognizer = new sherpa_onnx.OfflineRecognizer(config)
      return
    }

    throw new Error(`No valid model files found in ${this.bundleDir}`)
  }

  async feedAudio(stream) {
    if (this.getFlag('--mic')) {
      const seconds = Number(this.getOpt('--seconds', '5'))
      const device = this.getOpt('--input-device', 'default')
      console.log(`Recording ${seconds}s from ${device}...`)
      const wavPath = await recordMicWav(seconds, device)
      console.log('Recording done. Transcribing...')
      const wave = sherpa_onnx.readWave(wavPath)
      stream.acceptWaveform({ sampleRate: wave.sampleRate, samples: wave.samples })
      await fs.unlink(wavPath).catch(() => {})
    } else {
      const file = this.getOpt('--file')
      if (!file) {
        console.error('Provide --file <wav> or use --mic')
        process.exit(2)
      }
      console.log(`Loading audio file: ${file}`)
      const wave = sherpa_onnx.readWave(file)
      console.log('Transcribing...')
      stream.acceptWaveform({ sampleRate: wave.sampleRate, samples: wave.samples })
    }
  }

  async runLoop() {
    const device = this.getOpt('--input-device', 'default')
    const seconds = Number(this.getOpt('--seconds', '5'))
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    const ask = (q) => new Promise((resolve) => rl.question(q, resolve))
    console.log('Loop mode: Press Enter to record, or type q then Enter to quit.')
    while (true) {
      const ans = (await ask('> ')).trim()
      if (ans.toLowerCase() === 'q') break
      try {
        console.log(`Recording ${seconds}s from ${device}...`)
        const wavPath = await recordMicWav(seconds, device)
        console.log('Recording done. Transcribing...')
        const wave = sherpa_onnx.readWave(wavPath)
        const stream = this.recognizer.createStream()
        stream.acceptWaveform({ sampleRate: wave.sampleRate, samples: wave.samples })
        this.recognizer.decode(stream)
        const result = this.recognizer.getResult(stream)
        const text = result && typeof result === 'object' ? result.text : String(result)
        console.log(text)
        await fs.unlink(wavPath).catch(() => {})
      } catch (e) {
        console.error(e?.message || e)
      }
    }
    rl.close()
  }
}

async function main() {
  const app = new ParakeetSherpaApp(process.argv.slice(2))
  await app.run()
  // Native addon manages memory; no explicit free() needed
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

async function ensureParakeetBundle() {
  const url = 'https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-nemo-parakeet-tdt-0.6b-v2.tar.bz2'
  const cacheRoot = path.join(os.homedir(), '.cache', 'sherpa-onnx')
  const outDir = path.join(cacheRoot, 'sherpa-onnx-nemo-parakeet-tdt-0.6b-v2')

  // If already exists and has tokens + encoder/decoder, reuse
  try {
    await fs.access(path.join(outDir, 'tokens.txt'))
    let hasEncoder = false
    let hasDecoder = false
    try {
      await fs.access(path.join(outDir, 'encoder.int8.onnx'))
      hasEncoder = true
    } catch {
      try {
        await fs.access(path.join(outDir, 'encoder.onnx'))
        hasEncoder = true
      } catch {}
    }
    try {
      await fs.access(path.join(outDir, 'decoder.int8.onnx'))
      hasDecoder = true
    } catch {
      try {
        await fs.access(path.join(outDir, 'decoder.onnx'))
        hasDecoder = true
      } catch {}
    }
    if (hasEncoder && hasDecoder) return outDir
  } catch {}

  await fs.mkdir(cacheRoot, { recursive: true })
  const tarPath = path.join(cacheRoot, 'parakeet-tdt-0.6b-v2.tar.bz2')

  console.log('Downloading Parakeet bundle...')
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Download failed: ${res.status} ${res.statusText}`)
  const buf = Buffer.from(await res.arrayBuffer())
  await fs.writeFile(tarPath, buf)

  console.log('Extracting...')
  await decompress(tarPath, outDir, {
    plugins: [decompressTarbz2()],
    strip: 1, // remove leading folder if present
  })
  return outDir
}

async function findExistingModelFiles(bundleDir) {
  const tokens = path.join(bundleDir, 'tokens.txt')
  const exists = async (p) => {
    try { await fs.access(p); return true } catch { return false }
  }
  const firstExisting = async (paths) => {
    for (const p of paths) {
      if (await exists(p)) return p
    }
    return undefined
  }
  const encoder = await firstExisting([
    path.join(bundleDir, 'encoder.int8.onnx'),
    path.join(bundleDir, 'encoder.onnx'),
  ])
  const decoder = await firstExisting([
    path.join(bundleDir, 'decoder.int8.onnx'),
    path.join(bundleDir, 'decoder.onnx'),
  ])
  const joiner = await firstExisting([
    path.join(bundleDir, 'joiner.int8.onnx'),
    path.join(bundleDir, 'joiner.onnx'),
  ])
  let ctcModel = await firstExisting([
    path.join(bundleDir, 'model.int8.onnx'),
    path.join(bundleDir, 'model.onnx'),
  ])
  // If any transducer component exists, prefer transducer; otherwise CTC
  if (encoder && decoder && joiner) ctcModel = undefined
  return { tokens, encoder, decoder, joiner, ctcModel }
}

async function recordMicWav(seconds = 5, device = 'default') {
  const tmp = path.join(os.tmpdir(), `rec_${Date.now()}.wav`)
  const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg'
  const args = [
    '-y',
    '-f', 'dshow',
    '-i', `audio=${device}`,
    '-t', String(seconds),
    '-ar', '16000',
    '-ac', '1',
    '-acodec', 'pcm_s16le', // sherpa accepts 16-bit PCM
    tmp,
  ]
  await new Promise((resolve, reject) => {
    const p = spawn(ffmpeg, args)
    let stderr = ''
    if (p.stderr) {
      p.stderr.on('data', (d) => { stderr += d.toString() })
    }
    p.on('error', reject)
    p.on('exit', (code) => {
      if (code === 0) return resolve()
      const hint = `\nHint: Use --input-device "<device name>" and list devices via: ffmpeg -f dshow -list_devices true -i dummy`
      reject(new Error(`ffmpeg exit ${code}${stderr ? `\n${stderr.trim()}` : ''}${hint}`))
    })
  })
  return tmp
}

async function logStat(label, filePath) {
  try {
    const st = await fs.stat(filePath)
    console.log(`${label}: ${filePath} (${st.size} bytes)`) 
  } catch (e) {
    console.warn(`${label}: missing -> ${filePath}`)
  }
}

// no readWav helper needed; using sherpa_onnx.readWave


