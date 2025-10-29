#!/usr/bin/env node

/**
 * Simple test script for Parakeet models (standalone implementation)
 *
 * This script directly implements the core Parakeet functionality without
 * depending on TypeScript compilation.
 *
 * Usage:
 *   node test-parakeet-simple.mjs --list
 *   node test-parakeet-simple.mjs --download v2
 *   node test-parakeet-simple.mjs --download v3
 *   node test-parakeet-simple.mjs --test v2
 *   node test-parakeet-simple.mjs --test v3
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import decompress from 'decompress'
import decompressTarbz2 from 'decompress-tarbz2'

// Model URLs
const PARAKEET_V2_MODEL_URL = 'https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-nemo-parakeet-tdt-0.6b-v2-int8.tar.bz2'
const PARAKEET_V3_MODEL_URL = 'https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8.tar.bz2'

class SimpleParakeetTester {
  constructor(options) {
    this.options = options
  }

  async run() {
    try {
      if (this.options.list) {
        await this.listModels()
      } else if (this.options.download) {
        await this.downloadModel(this.options.download)
      } else if (this.options.test) {
        await this.testModel(this.options.test)
      } else {
        this.showUsage()
      }
    } catch (error) {
      console.error('Error:', error.message)
      process.exit(1)
    }
  }

  async listModels() {
    console.log('📋 Available Parakeet Models:')
    console.log('')

    const models = [
      {
        version: 'v2',
        name: 'NVIDIA Parakeet TDT 0.6B V2 (English)',
        languages: 'English only',
        optimization: 'int8 quantized',
        url: 'sherpa-onnx-nemo-parakeet-tdt-0.6b-v2-int8.tar.bz2'
      },
      {
        version: 'v3',
        name: 'NVIDIA Parakeet TDT 0.6B V3 Multilingual',
        languages: '25 European languages',
        optimization: 'int8 quantized',
        url: 'sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8.tar.bz2'
      }
    ]

    for (const model of models) {
      const isDownloaded = await this.isModelDownloaded(model.version)
      const status = isDownloaded ? '✅ Downloaded' : '❌ Not downloaded'
      const size = await this.getModelSize(model.version)

      console.log(`${model.version.toUpperCase()}:`)
      console.log(`  Name: ${model.name}`)
      console.log(`  Languages: ${model.languages}`)
      console.log(`  Optimization: ${model.optimization}`)
      console.log(`  Status: ${status}`)
      if (size) {
        console.log(`  Size: ${this.formatFileSize(size)}`)
      }
      console.log('')
    }
  }

  async downloadModel(version) {
    console.log(`📥 Downloading Parakeet ${version} model...`)

    const isDownloaded = await this.isModelDownloaded(version)
    if (isDownloaded) {
      console.log(`✅ Model ${version} is already downloaded.`)
      console.log(`📁 Location: ${this.getModelDir(version)}`)
      return
    }

    const modelUrl = version === 'v2' ? PARAKEET_V2_MODEL_URL : PARAKEET_V3_MODEL_URL
    const cacheDir = this.getModelDir(version)
    const tarPath = path.join(os.homedir(), '.cache', 'sherpa-onnx', `parakeet-tdt-0.6b-${version}.tar.bz2`)

    try {
      // Create cache directory
      await fs.mkdir(path.dirname(cacheDir), { recursive: true })
      await fs.mkdir(path.dirname(tarPath), { recursive: true })

      console.log(`📥 Downloading from: ${modelUrl}`)
      console.log('⏳ Download started...')

      const startTime = Date.now()
      const response = await fetch(modelUrl)
      if (!response.ok) {
        throw new Error(`Download failed: ${response.status} ${response.statusText}`)
      }

      const buffer = Buffer.from(await response.arrayBuffer())
      await fs.writeFile(tarPath, buffer)

      const downloadTime = ((Date.now() - startTime) / 1000).toFixed(1)
      console.log(`✅ Download complete (${downloadTime}s, ${this.formatFileSize(buffer.length)})`)

      console.log('📦 Extracting model...')
      const extractStartTime = Date.now()

      await decompress(tarPath, cacheDir, {
        plugins: [decompressTarbz2()],
        strip: 1,
      })

      const extractTime = ((Date.now() - extractStartTime) / 1000).toFixed(1)
      console.log(`✅ Extraction complete (${extractTime}s)`)
      console.log(`📁 Model saved to: ${cacheDir}`)

      // Clean up the tar file
      await fs.unlink(tarPath).catch(() => {})

      // Verify the installation
      const isValid = await this.validateModel(cacheDir)
      if (isValid) {
        console.log('✅ Model validation passed!')
      } else {
        console.warn('⚠️  Model validation failed - some files may be missing')
      }

    } catch (error) {
      console.error(`❌ Failed to download model ${version}:`, error.message)
      throw error
    }
  }

  async testModel(version) {
    console.log(`🧪 Testing Parakeet ${version} model...`)

    // Check if sherpa-onnx-node is available
    let sherpaOnnx
    try {
      sherpaOnnx = await import('sherpa-onnx-node')
    } catch (error) {
      console.error('❌ sherpa-onnx-node is not available.')
      console.log('💡 Install it with: npm install sherpa-onnx-node')
      return
    }

    // Check if model is downloaded
    const isDownloaded = await this.isModelDownloaded(version)
    if (!isDownloaded) {
      console.log(`❌ Model ${version} is not downloaded.`)
      console.log(`💡 Run: node test-parakeet-simple.mjs --download ${version}`)
      return
    }

    const cacheDir = this.getModelDir(version)
    console.log(`📁 Using model from: ${cacheDir}`)

    try {
      // Load model
      console.log('🔧 Loading model...')
      const startTime = Date.now()

      const config = await this.createModelConfig(cacheDir, sherpaOnnx)
      if (!config) {
        throw new Error('Failed to create model configuration')
      }

      const recognizer = new sherpaOnnx.OfflineRecognizer(config)
      const loadTime = ((Date.now() - startTime) / 1000).toFixed(1)
      console.log(`✅ Model loaded successfully (${loadTime}s)!`)

      // Test with a dummy audio buffer
      console.log('🧪 Testing with dummy audio data...')
      const testAudio = new Float32Array(16000) // 1 second of silence at 16kHz

      const testStartTime = Date.now()
      const stream = recognizer.createStream()
      stream.acceptWaveform({ sampleRate: 16000, samples: Array.from(testAudio) })
      recognizer.decode(stream)

      const result = recognizer.getResult(stream)
      const testTime = ((Date.now() - testStartTime) / 1000).toFixed(2)

      console.log(`✅ Test transcription complete (${testTime}s):`)
      console.log(`📝 Result: "${result.text || '(empty - expected for silence)'}"`)
      console.log('')
      console.log('🎉 Model test successful! Ready for real audio transcription.')

    } catch (error) {
      console.error(`❌ Model test failed:`, error.message)
      throw error
    }
  }

  getModelDir(version) {
    const cacheRoot = path.join(os.homedir(), '.cache', 'sherpa-onnx')
    const modelName = version === 'v2' ? 'sherpa-onnx-nemo-parakeet-tdt-0.6b-v2' : 'sherpa-onnx-nemo-parakeet-tdt-0.6b-v3'
    return path.join(cacheRoot, modelName)
  }

  async isModelDownloaded(version) {
    const cacheDir = this.getModelDir(version)
    try {
      await fs.access(cacheDir)
      return await this.validateModel(cacheDir)
    } catch {
      return false
    }
  }

  async validateModel(cacheDir) {
    try {
      // Check for required files
      const files = await fs.readdir(cacheDir)
      const hasTokens = files.includes('tokens.txt')

      // Check for either int8 or regular model files
      const hasEncoder = files.some(f => f.startsWith('encoder'))
      const hasDecoder = files.some(f => f.startsWith('decoder'))
      const hasJoiner = files.some(f => f.startsWith('joiner'))
      const hasModel = files.some(f => f.startsWith('model'))

      return hasTokens && ((hasEncoder && hasDecoder && hasJoiner) || hasModel)
    } catch {
      return false
    }
  }

  async getModelSize(version) {
    const cacheDir = this.getModelDir(version)
    try {
      const files = await fs.readdir(cacheDir)
      let totalSize = 0

      for (const file of files) {
        const filePath = path.join(cacheDir, file)
        const stat = await fs.stat(filePath)
        if (stat.isFile()) {
          totalSize += stat.size
        }
      }

      return totalSize
    } catch {
      return null
    }
  }

  async createModelConfig(cacheDir, sherpaOnnx) {
    try {
      const files = await fs.readdir(cacheDir)
      const tokens = path.join(cacheDir, 'tokens.txt')

      // Check for Transducer model files
      const encoder = files.find(f => f.startsWith('encoder'))
      const decoder = files.find(f => f.startsWith('decoder'))
      const joiner = files.find(f => f.startsWith('joiner'))

      if (encoder && decoder && joiner) {
        // Transducer model configuration
        return {
          featConfig: { sampleRate: 16000, featureDim: 80 },
          modelConfig: {
            transducer: {
              encoder: path.join(cacheDir, encoder),
              decoder: path.join(cacheDir, decoder),
              joiner: path.join(cacheDir, joiner)
            },
            tokens,
            numThreads: 2,
            provider: 'cpu',
            debug: 0,
            modelType: 'nemo_transducer',
          },
        }
      }

      // Check for CTC model files
      const model = files.find(f => f.startsWith('model'))
      if (model) {
        // CTC model configuration
        return {
          featConfig: { sampleRate: 16000, featureDim: 80 },
          modelConfig: {
            nemoCtc: { model: path.join(cacheDir, model) },
            tokens,
            numThreads: 2,
            provider: 'cpu',
            debug: 0,
            modelType: 'nemo_ctc',
          },
        }
      }

      return null
    } catch (error) {
      console.error('Error creating model config:', error)
      return null
    }
  }

  formatFileSize(bytes) {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
  }

  showUsage() {
    console.log('🎤 Parakeet STT Test Script')
    console.log('')
    console.log('Usage:')
    console.log('  node test-parakeet-simple.mjs --list                    # List available models')
    console.log('  node test-parakeet-simple.mjs --download <v2|v3>       # Download a model')
    console.log('  node test-parakeet-simple.mjs --test <v2|v3>           # Test a model')
    console.log('')
    console.log('Examples:')
    console.log('  node test-parakeet-simple.mjs --list')
    console.log('  node test-parakeet-simple.mjs --download v2')
    console.log('  node test-parakeet-simple.mjs --test v3')
    console.log('')
    console.log('Requirements:')
    console.log('  • sherpa-onnx-node package (npm install sherpa-onnx-node)')
    console.log('  • Internet connection for model downloads')
    console.log('  • Sufficient disk space (~500MB per model)')
  }
}

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2)
  const options = {}

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--list':
        options.list = true
        break
      case '--download':
        options.download = args[++i]
        break
      case '--test':
        options.test = args[++i]
        break
      case '--help':
      case '-h':
        options.list = true
        break
    }
  }

  return options
}

// Main execution
async function main() {
  const options = parseArgs()
  const tester = new SimpleParakeetTester(options)
  await tester.run()
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason)
  process.exit(1)
})

// Run the script
main().catch(console.error)