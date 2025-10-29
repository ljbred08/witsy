import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import decompress from 'decompress'
import decompressTarbz2 from 'decompress-tarbz2'
import * as sherpaOnnx from 'sherpa-onnx-node'
import { ProgressCallback, TranscribeResponse } from '../stt'

const PARAKEET_V2_MODEL_URL = 'https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-nemo-parakeet-tdt-0.6b-v2-int8.tar.bz2'
const PARAKEET_V3_MODEL_URL = 'https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8.tar.bz2'

export async function ensureParakeetBundle(modelVersion: 'v2' | 'v3'): Promise<string> {
  const cacheRoot = path.join(os.homedir(), '.cache', 'sherpa-onnx')
  const modelName = modelVersion === 'v2' ? 'sherpa-onnx-nemo-parakeet-tdt-0.6b-v2' : 'sherpa-onnx-nemo-parakeet-tdt-0.6b-v3'
  const outDir = path.join(cacheRoot, modelName)

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
  const modelUrl = modelVersion === 'v2' ? PARAKEET_V2_MODEL_URL : PARAKEET_V3_MODEL_URL
  const tarPath = path.join(cacheRoot, `parakeet-tdt-0.6b-${modelVersion}.tar.bz2`)

  console.log(`Downloading Parakeet ${modelVersion} model...`)
  const response = await fetch(modelUrl)
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

async function findModelFiles(bundleDir: string): Promise<{ tokens: string, encoder?: string, decoder?: string, joiner?: string, ctcModel?: string }> {
  const files = await fs.readdir(bundleDir)
  const tokens = path.join(bundleDir, 'tokens.txt')

  // Check for Transducer model files
  const encoder = files.find(f => f.startsWith('encoder')) ? path.join(bundleDir, files.find(f => f.startsWith('encoder'))!) : undefined
  const decoder = files.find(f => f.startsWith('decoder')) ? path.join(bundleDir, files.find(f => f.startsWith('decoder'))!) : undefined
  const joiner = files.find(f => f.startsWith('joiner')) ? path.join(bundleDir, files.find(f => f.startsWith('joiner'))!) : undefined

  if (encoder && decoder && joiner) {
    return { tokens, encoder, decoder, joiner }
  }

  // Check for CTC model files
  const ctcModel = files.find(f => f.startsWith('model')) ? path.join(bundleDir, files.find(f => f.startsWith('model'))!) : undefined

  return { tokens, ctcModel }
}

export async function createParakeetTranscriber(
  model: string,
  callback: ProgressCallback
): Promise<(audio: Float32Array, opts?: object) => Promise<TranscribeResponse>> {
  if (!sherpaOnnx) {
    throw new Error('sherpa-onnx-node is not available')
  }

  const modelVersion = model.includes('v3') ? 'v3' : 'v2'
  callback?.({ status: 'progress', message: `Downloading Parakeet ${modelVersion} model...` })
  const bundleDir = await ensureParakeetBundle(modelVersion)

  callback?.({ status: 'progress', message: 'Loading model files...' })
  const { tokens, encoder, decoder, joiner, ctcModel } = await findModelFiles(bundleDir)

  if (!tokens) {
    throw new Error('Required model files not found')
  }

  let config: any

  if (encoder && decoder && joiner) {
    // Transducer model configuration
    config = {
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
  } else if (ctcModel) {
    // CTC model configuration
    config = {
      featConfig: { sampleRate: 16000, featureDim: 80 },
      modelConfig: {
        nemoCtc: { model: ctcModel },
        tokens,
        numThreads: 2,
        provider: 'cpu',
        debug: 0,
        modelType: 'nemo_ctc',
      },
    }
  } else {
    throw new Error('Invalid model configuration')
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

/** Checks if the Parakeet model bundle is already downloaded and valid */
export async function isParakeetModelDownloaded(modelVersion: 'v2' | 'v3'): Promise<boolean> {
  const cacheRoot = path.join(os.homedir(), '.cache', 'sherpa-onnx')
  const modelName = modelVersion === 'v2' ? 'sherpa-onnx-nemo-parakeet-tdt-0.6b-v2' : 'sherpa-onnx-nemo-parakeet-tdt-0.6b-v3'
  const outDir = path.join(cacheRoot, modelName)
  try {
    await fs.access(outDir)
    return await hasValidModelFiles(outDir)
  } catch {
    return false
  }
}

/** Deletes the downloaded Parakeet model bundle */
export async function deleteParakeetModel(modelVersion: 'v2' | 'v3'): Promise<void> {
  const cacheRoot = path.join(os.homedir(), '.cache', 'sherpa-onnx')
  const modelName = modelVersion === 'v2' ? 'sherpa-onnx-nemo-parakeet-tdt-0.6b-v2' : 'sherpa-onnx-nemo-parakeet-tdt-0.6b-v3'
  const outDir = path.join(cacheRoot, modelName)
  try {
    await fs.rm(outDir, { recursive: true, force: true })
  } catch {
    // ignore errors
  }
}

/** Deletes all cached Parakeet model bundles */
export async function deleteAllParakeetModels(): Promise<void> {
  const cacheRoot = path.join(os.homedir(), '.cache', 'sherpa-onnx')
  try {
    await fs.rm(cacheRoot, { recursive: true, force: true })
  } catch {
    // ignore errors
  }
}