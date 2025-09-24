import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import decompress from 'decompress'
import decompressTarbz2 from 'decompress-tarbz2'
import * as sherpaOnnx from 'sherpa-onnx-node'
import { ProgressCallback, TranscribeResponse } from '../stt'

const PARAKEET_MODEL_URL = 'https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-nemo-parakeet-tdt-0.6b-v2.tar.bz2'

export async function ensureParakeetBundle(): Promise<string> {
  const cacheRoot = path.join(os.homedir(), '.cache', 'sherpa-onnx')
  const outDir = path.join(cacheRoot, 'sherpa-onnx-nemo-parakeet-tdt-0.6b-v2')

  // Check if model already exists
  try {
    await fs.access(path.join(outDir, 'tokens.txt'))
    const hasModel = await hasValidModelFiles(outDir)
    if (hasModel) return outDir
  } catch {
    // Model doesn't exist, continue with download
  }

  // Create cache directory
  await fs.mkdir(cacheRoot, { recursive: true })
  const tarPath = path.join(cacheRoot, 'parakeet-tdt-0.6b-v2.tar.bz2')

  console.log('Downloading Parakeet model...')
  const response = await fetch(PARAKEET_MODEL_URL)
  if (!response.ok) {
    throw new Error(`Download failed: ${response.status} ${response.statusText}`)
  }
  
  const buffer = Buffer.from(await response.arrayBuffer())
  await fs.writeFile(tarPath, buffer)

  console.log('Extracting model...')
  await decompress(tarPath, outDir, {
    plugins: [decompressTarbz2()],
    strip: 1,
  })

  return outDir
}

async function hasValidModelFiles(dir: string): Promise<boolean> {
  const encoderExists = await fileExists(path.join(dir, 'encoder.onnx')) || 
                       await fileExists(path.join(dir, 'encoder.int8.onnx'))
  const decoderExists = await fileExists(path.join(dir, 'decoder.onnx')) || 
                       await fileExists(path.join(dir, 'decoder.int8.onnx'))
  const joinerExists = await fileExists(path.join(dir, 'joiner.onnx')) || 
                    await fileExists(path.join(dir, 'joiner.int8.onnx'))
  
  return encoderExists && decoderExists && joinerExists
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

export async function findModelFiles(bundleDir: string) {
  const tokens = path.join(bundleDir, 'tokens.txt')
  
  // Check for transducer model files
  const encoder = await findFirstValidFile([
    path.join(bundleDir, 'encoder.int8.onnx'),
    path.join(bundleDir, 'encoder.onnx'),
  ])
  
  const decoder = await findFirstValidFile([
    path.join(bundleDir, 'decoder.int8.onnx'),
    path.join(bundleDir, 'decoder.onnx'),
  ])
  
  const joiner = await findFirstValidFile([
    path.join(bundleDir, 'joiner.int8.onnx'),
    path.join(bundleDir, 'joiner.onnx'),
  ])
  
  return { tokens, encoder, decoder, joiner }
}

async function findFirstValidFile(filePaths: string[]): Promise<string | undefined> {
  for (const filePath of filePaths) {
    try {
      await fs.access(filePath)
      return filePath
    } catch {
      continue
    }
  }
  return undefined
}

export async function createParakeetTranscriber(
  callback: ProgressCallback
): Promise<(audio: Float32Array, opts?: object) => Promise<TranscribeResponse>> {
  if (!sherpaOnnx) {
    throw new Error('sherpa-onnx-node is not available')
  }

  callback?.({ status: 'progress', message: 'Downloading Parakeet model...' })
  const bundleDir = await ensureParakeetBundle()

  callback?.({ status: 'progress', message: 'Loading model files...' })
  const { tokens, encoder, decoder, joiner } = await findModelFiles(bundleDir)

  if (!encoder || !decoder || !joiner || !tokens) {
    throw new Error('Required model files not found')
  }

  const config = {
    featConfig: { sampleRate: 16000, featureDim: 80 },
    modelConfig: {
      transducer: { encoder, decoder, joiner },
      tokens,
      numThreads: 2,
      provider: 'cpu',
      debug: 0,
      modelType: 'nemo_transducer',
    },
  }

  const recognizer = new sherpaOnnx.OfflineRecognizer(config)
  callback?.({ status: 'ready' })

  return async (audio: Float32Array, opts?: object) => {
    const samples = Array.from(audio)
    const stream = recognizer.createStream()
    stream.acceptWaveform({ sampleRate: 16000, samples })
    recognizer.decode(stream)

    const result = recognizer.getResult(stream)
    const text = result?.text || ''
    return { text } as TranscribeResponse
  }
}
+
+/** Checks if the Parakeet model bundle is already downloaded and valid */
+export async function isParakeetModelDownloaded(): Promise<boolean> {
+  const cacheRoot = path.join(os.homedir(), '.cache', 'sherpa-onnx')
+  const outDir = path.join(cacheRoot, 'sherpa-onnx-nemo-parakeet-tdt-0.6b-v2')
+  try {
+    await fs.access(outDir)
+    return await hasValidModelFiles(outDir)
+  } catch {
+    return false
+  }
+}
+
+/** Deletes the downloaded Parakeet model bundle */
+export async function deleteParakeetModel(): Promise<void> {
+  const cacheRoot = path.join(os.homedir(), '.cache', 'sherpa-onnx')
+  const outDir = path.join(cacheRoot, 'sherpa-onnx-nemo-parakeet-tdt-0.6b-v2')
+  try {
+    await fs.rm(outDir, { recursive: true, force: true })
+  } catch {
+    // ignore errors
+  }
+}
+
+/** Deletes all cached Parakeet model bundles */
+export async function deleteAllParakeetModels(): Promise<void> {
+  const cacheRoot = path.join(os.homedir(), '.cache', 'sherpa-onnx')
+  try {
+    await fs.rm(cacheRoot, { recursive: true, force: true })
+  } catch {
+    // ignore errors
+  }
+}
  callback: ProgressCallback
): Promise<(audio: Float32Array, opts?: object) => Promise<TranscribeResponse>> {
  if (!sherpaOnnx) {
    throw new Error('sherpa-onnx-node is not available')
  }

  callback?.({ status: 'progress', message: 'Downloading Parakeet model...' })
  const bundleDir = await ensureParakeetBundle()

  callback?.({ status: 'progress', message: 'Loading model files...' })
  const { tokens, encoder, decoder, joiner } = await findModelFiles(bundleDir)

  if (!encoder || !decoder || !joiner || !tokens) {
    throw new Error('Required model files not found')
  }

  const config = {
    featConfig: { sampleRate: 16000, featureDim: 80 },
    modelConfig: {
      transducer: { encoder, decoder, joiner },
      tokens,
      numThreads: 2,
      provider: 'cpu',
      debug: 0,
      modelType: 'nemo_transducer',
    },
  }

  const recognizer = new sherpaOnnx.OfflineRecognizer(config)
  callback?.({ status: 'ready' })

  return async (audio: Float32Array, opts?: object) => {
    // Convert Float32Array to the format expected by sherpa-onnx
    const samples = Array.from(audio)
    const stream = recognizer.createStream()

    stream.acceptWaveform({ sampleRate: 16000, samples })
    recognizer.decode(stream)

    const result = recognizer.getResult(stream)
    const text = result?.text || ''

    return { text } as TranscribeResponse
  }
}
