#!/usr/bin/env node

/**
 * Test script for Parakeet v2 and v3 STT models
 *
 * Usage:
 *   node test-parakeet.js --model v2 --file audio.wav
 *   node test-parakeet.js --model v3 --file audio.wav
 *   node test-parakeet.js --model v2 --mic --seconds 5
 *   node test-parakeet.js --download v2
 *   node test-parakeet.js --download v3
 *   node test-parakeet.js --list
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Type definitions for standalone testing
type ProgressCallback = (data: ProgressInfo) => void

interface ProgressInfo {
  status: 'progress' | 'ready' | 'error'
  message?: string
}

interface TranscribeResponse {
  text: string
}

// Import our Parakeet implementation
// (Works with ts-node or compiled with TypeScript)
import {
  createParakeetTranscriber,
  ensureParakeetBundle,
  isParakeetModelDownloaded,
  deleteParakeetModel
} from './local-parakeet'

interface TestOptions {
  model?: 'v2' | 'v3'
  file?: string
  mic?: boolean
  seconds?: number
  download?: 'v2' | 'v3'
  list?: boolean
}

class ParakeetTester {
  private options: TestOptions

  constructor(options: TestOptions) {
    this.options = options
  }

  async run(): Promise<void> {
    try {
      if (this.options.list) {
        await this.listModels()
      } else if (this.options.download) {
        await this.downloadModel(this.options.download)
      } else if (this.options.model) {
        await this.testModel(this.options.model)
      } else {
        this.showUsage()
      }
    } catch (error) {
      console.error('Error:', error.message)
      process.exit(1)
    }
  }

  private async listModels(): Promise<void> {
    console.log('📋 Available Parakeet Models:')
    console.log('')

    const models = [
      {
        version: 'v2',
        name: 'NVIDIA Parakeet TDT 0.6B V2 (English)',
        languages: 'English only',
        url: 'sherpa-onnx-nemo-parakeet-tdt-0.6b-v2-int8.tar.bz2'
      },
      {
        version: 'v3',
        name: 'NVIDIA Parakeet TDT 0.6B V3 Multilingual',
        languages: '25 European languages',
        url: 'sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8.tar.bz2'
      }
    ]

    for (const model of models) {
      const isDownloaded = await isParakeetModelDownloaded(model.version as 'v2' | 'v3')
      const status = isDownloaded ? '✅ Downloaded' : '❌ Not downloaded'

      console.log(`${model.version.toUpperCase()}:`)
      console.log(`  Name: ${model.name}`)
      console.log(`  Languages: ${model.languages}`)
      console.log(`  Status: ${status}`)
      console.log('')
    }
  }

  private async downloadModel(version: 'v2' | 'v3'): Promise<void> {
    console.log(`📥 Downloading Parakeet ${version} model...`)

    const isDownloaded = await isParakeetModelDownloaded(version)
    if (isDownloaded) {
      console.log(`✅ Model ${version} is already downloaded.`)
      return
    }

    const startTime = Date.now()
    const callback = (data: any) => {
      if (data.status === 'progress') {
        console.log(`⏳ ${data.message}`)
      } else if (data.status === 'ready') {
        const duration = ((Date.now() - startTime) / 1000).toFixed(1)
        console.log(`✅ Model ${version} ready! (took ${duration}s)`)
      } else if (data.status === 'error') {
        console.error(`❌ Error: ${data.message}`)
      }
    }

    try {
      const bundleDir = await ensureParakeetBundle(version)
      console.log(`📁 Model saved to: ${bundleDir}`)
    } catch (error) {
      console.error(`❌ Failed to download model ${version}:`, error.message)
      throw error
    }
  }

  private async testModel(version: 'v2' | 'v3'): Promise<void> {
    console.log(`🎤 Testing Parakeet ${version} model...`)

    // Check if model is downloaded
    const isDownloaded = await isParakeetModelDownloaded(version)
    if (!isDownloaded) {
      console.log(`❌ Model ${version} is not downloaded. Run --download ${version} first.`)
      return
    }

    // Create transcriber
    const modelName = version === 'v2' ? 'nvidia/parakeet-tdt-0.6b-v2' : 'nvidia/parakeet-tdt-0.6b-v3'
    const transcriber = await this.createTranscriber(modelName)

    if (this.options.file) {
      await this.transcribeFile(transcriber, this.options.file)
    } else if (this.options.mic) {
      await this.transcribeMicrophone(transcriber, this.options.seconds || 5)
    } else {
      console.log('❌ Please specify --file <audio.wav> or --mic [--seconds <duration>]')
    }
  }

  private async createTranscriber(modelName: string) {
    console.log('🔧 Loading model...')
    const startTime = Date.now()

    const callback = (data: any) => {
      if (data.status === 'progress') {
        console.log(`⏳ ${data.message}`)
      } else if (data.status === 'ready') {
        const duration = ((Date.now() - startTime) / 1000).toFixed(1)
        console.log(`✅ Model loaded! (took ${duration}s)`)
      } else if (data.status === 'error') {
        console.error(`❌ Error: ${data.message}`)
      }
    }

    return await createParakeetTranscriber(modelName, callback)
  }

  private async transcribeFile(transcriber: Function, filePath: string): Promise<void> {
    console.log(`📄 Transcribing file: ${filePath}`)

    try {
      // Check if file exists
      await fs.access(filePath)

      // Convert audio file to Float32Array
      const audioData = await this.convertAudioFile(filePath)
      console.log(`🎵 Audio loaded: ${audioData.length} samples`)

      // Transcribe
      const startTime = Date.now()
      const result = await transcriber(audioData)
      const duration = ((Date.now() - startTime) / 1000).toFixed(2)

      console.log('')
      console.log(`📝 Transcription (${duration}s):`)
      console.log(`"${result.text}"`)
      console.log('')

    } catch (error) {
      console.error(`❌ Failed to transcribe file:`, error.message)
      throw error
    }
  }

  private async transcribeMicrophone(transcriber: Function, seconds: number): Promise<void> {
    console.log(`🎙️  Recording from microphone for ${seconds} seconds...`)

    try {
      // Record audio
      const audioData = await this.recordMicrophone(seconds)
      console.log(`🎵 Audio recorded: ${audioData.length} samples`)

      // Transcribe
      const startTime = Date.now()
      const result = await transcriber(audioData)
      const duration = ((Date.now() - startTime) / 1000).toFixed(2)

      console.log('')
      console.log(`📝 Transcription (${duration}s):`)
      console.log(`"${result.text}"`)
      console.log('')

    } catch (error) {
      console.error(`❌ Failed to transcribe microphone:`, error.message)
      throw error
    }
  }

  private async convertAudioFile(filePath: string): Promise<Float32Array> {
    return new Promise((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', [
        '-i', filePath,
        '-ar', '16000',     // Sample rate
        '-ac', '1',        // Mono
        '-acodec', 'pcm_f32le', // 32-bit float PCM
        '-f', 'f32le',     // Float32 format
        '-'                 // Output to stdout
      ])

      let buffer = Buffer.alloc(0)

      ffmpeg.stdout.on('data', (data) => {
        buffer = Buffer.concat([buffer, data])
      })

      ffmpeg.stderr.on('data', (data) => {
        // ffmpeg writes progress info to stderr, ignore it
      })

      ffmpeg.on('error', (error) => {
        reject(new Error(`FFmpeg error: ${error.message}`))
      })

      ffmpeg.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`FFmpeg exited with code ${code}`))
          return
        }

        // Convert Buffer to Float32Array
        const float32Array = new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4)
        resolve(float32Array)
      })
    })
  }

  private async recordMicrophone(seconds: number): Promise<Float32Array> {
    return new Promise((resolve, reject) => {
      const tempFile = path.join(__dirname, `temp_recording_${Date.now()}.wav`)

      // Determine the proper audio device command based on platform
      let ffmpegArgs: string[]

      if (process.platform === 'win32') {
        ffmpegArgs = [
          '-f', 'dshow',
          '-i', 'audio="Microphone"',
          '-t', String(seconds),
          '-ar', '16000',
          '-ac', '1',
          '-y',
          tempFile
        ]
      } else if (process.platform === 'darwin') {
        ffmpegArgs = [
          '-f', 'avfoundation',
          '-i', ':0',
          '-t', String(seconds),
          '-ar', '16000',
          '-ac', '1',
          '-y',
          tempFile
        ]
      } else {
        ffmpegArgs = [
          '-f', 'alsa',
          '-i', 'default',
          '-t', String(seconds),
          '-ar', '16000',
          '-ac', '1',
          '-y',
          tempFile
        ]
      }

      console.log('🎙️  Starting recording...')
      const ffmpeg = spawn('ffmpeg', ffmpegArgs)

      ffmpeg.stderr.on('data', (data) => {
        // Show recording progress
        const output = data.toString().trim()
        if (output && !output.includes('frame=')) {
          console.log(`📊 ${output}`)
        }
      })

      ffmpeg.on('error', (error) => {
        reject(new Error(`Recording error: ${error.message}`))
      })

      ffmpeg.on('close', async (code) => {
        if (code !== 0) {
          reject(new Error(`Recording failed with code ${code}`))
          return
        }

        try {
          console.log('✅ Recording complete, processing audio...')
          const audioData = await this.convertAudioFile(tempFile)

          // Clean up temp file
          await fs.unlink(tempFile).catch(() => {}) // Ignore cleanup errors

          resolve(audioData)
        } catch (error) {
          // Clean up temp file even if processing failed
          await fs.unlink(tempFile).catch(() => {})
          reject(error)
        }
      })
    })
  }

  private showUsage(): void {
    console.log('🎤 Parakeet STT Test Script')
    console.log('')
    console.log('Usage:')
    console.log('  node test-parakeet.js --list                           # List available models')
    console.log('  node test-parakeet.js --download <v2|v3>              # Download a model')
    console.log('  node test-parakeet.js --model <v2|v3> --file <audio.wav>  # Transcribe audio file')
    console.log('  node test-parakeet.js --model <v2|v3> --mic [--seconds 5]  # Transcribe microphone')
    console.log('')
    console.log('Examples:')
    console.log('  node test-parakeet.js --download v2')
    console.log('  node test-parakeet.js --model v2 --file test.wav')
    console.log('  node test-parakeet.js --model v3 --mic --seconds 3')
    console.log('')
    console.log('Requirements:')
    console.log('  - ffmpeg must be installed and in PATH')
    console.log('  - Working microphone for --mic option')
  }
}

// Parse command line arguments
function parseArgs(): TestOptions {
  const args = process.argv.slice(2)
  const options: TestOptions = {}

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--model':
        options.model = args[++i] as 'v2' | 'v3'
        break
      case '--file':
        options.file = args[++i]
        break
      case '--mic':
        options.mic = true
        break
      case '--seconds':
        options.seconds = parseInt(args[++i])
        break
      case '--download':
        options.download = args[++i] as 'v2' | 'v3'
        break
      case '--list':
        options.list = true
        break
      case '--help':
      case '-h':
        options.list = true // Will show usage
        break
    }
  }

  return options
}

// Main execution
async function main() {
  const options = parseArgs()
  const tester = new ParakeetTester(options)
  await tester.run()
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason)
  process.exit(1)
})

// Run the script
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error)
}