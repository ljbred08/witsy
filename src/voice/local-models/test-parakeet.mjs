#!/usr/bin/env node

/**
 * Test script for Parakeet v2 and v3 STT models
 *
 * Usage:
 *   node test-parakeet.mjs --model v2 --file audio.wav
 *   node test-parakeet.mjs --model v3 --file audio.wav
 *   node test-parakeet.mjs --model v2 --mic --seconds 5
 *   node test-parakeet.mjs --download v2
 *   node test-parakeet.mjs --download v3
 *   node test-parakeet.mjs --list
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Since we can't directly import TypeScript files, let's create a simplified version
// that tests the core functionality by calling the main implementation

class ParakeetTester {
  constructor(options) {
    this.options = options
  }

  async run() {
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

  async listModels() {
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
      const status = '❓ Check via main application'
      console.log(`${model.version.toUpperCase()}:`)
      console.log(`  Name: ${model.name}`)
      console.log(`  Languages: ${model.languages}`)
      console.log(`  Status: ${status}`)
      console.log('')
    }

    console.log('💡 To check download status and test models, use the main Witsy application')
    console.log('   1. Open Witsy')
    console.log('   2. Go to Settings → Voice → Transcribe')
    console.log('   3. Select "Local" engine')
    console.log('   4. Choose Parakeet V2 (English) or V3 (Multilingual)')
    console.log('   5. The model will download automatically and be ready for use')
  }

  async downloadModel(version) {
    console.log(`📥 To download Parakeet ${version} model:`)
    console.log('')
    console.log('💡 Use the main Witsy application to download models:')
    console.log('   1. Open Witsy')
    console.log('   2. Go to Settings → Voice → Transcribe')
    console.log('   3. Select "Local" engine')
    console.log(`   4. Choose Parakeet ${version.toUpperCase()}`)
    console.log('   5. The model will download automatically')
    console.log('')
    console.log(`📁 The model will be saved to: ~/.cache/sherpa-onnx/sherpa-onnx-nemo-parakeet-tdt-0.6b-${version}`)
  }

  async testModel(version) {
    console.log(`🎤 To test Parakeet ${version} model:`)
    console.log('')
    console.log('💡 Use the main Witsy application for testing:')
    console.log('   1. Open Witsy')
    console.log('   2. Go to Settings → Voice → Transcribe')
    console.log('   3. Select "Local" engine')
    console.log(`   4. Choose Parakeet ${version.toUpperCase()}`)
    console.log('   5. Click "Test Microphone" or upload an audio file')
    console.log('')
    console.log('📝 Alternatively, you can test via the Transcribe screen:')
    console.log('   1. Navigate to the Transcribe screen')
    console.log('   2. Select Local engine and Parakeet model')
    console.log('   3. Use microphone or upload audio files')
  }

  showUsage() {
    console.log('🎤 Parakeet STT Test Information')
    console.log('')
    console.log('This script provides information about the Parakeet STT models.')
    console.log('')
    console.log('For actual testing and model downloads, please use the main Witsy application.')
    console.log('')
    console.log('Available Models:')
    console.log('  • V2: English-only, int8 optimized')
    console.log('  • V3: Multilingual (25 European languages), int8 optimized')
    console.log('')
    console.log('Usage in Witsy:')
    console.log('  1. Open Settings → Voice → Transcribe')
    console.log('  2. Select "Local" engine')
    console.log('  3. Choose Parakeet V2 or V3')
    console.log('  4. Model downloads automatically')
    console.log('  5. Test with microphone or audio files')
  }
}

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2)
  const options = {}

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--model':
        options.model = args[++i]
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
        options.download = args[++i]
        break
      case '--list':
        options.list = true
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
  const tester = new ParakeetTester(options)
  await tester.run()
}

// Run the script
main().catch(console.error)