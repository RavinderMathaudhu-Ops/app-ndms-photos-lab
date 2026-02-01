#!/usr/bin/env node

/**
 * NDMS Admin CLI - PIN Management Tool
 * 
 * Usage:
 *   node scripts/admin-cli.js create-pin "Team Name"
 *   node scripts/admin-cli.js create-pins 5
 *   node scripts/admin-cli.js --help
 */

const https = require('https')
const readline = require('readline')

const API_BASE_URL = process.env.API_URL || 'http://localhost:3000'
const ADMIN_TOKEN = process.env.ADMIN_TOKEN

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
}

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`)
}

function makeRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(API_BASE_URL + path)
    const isHttps = url.protocol === 'https:'
    const client = isHttps ? https : require('http')

    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'x-admin-token': ADMIN_TOKEN || '',
      },
    }

    const req = client.request(url, options, (res) => {
      let data = ''

      res.on('data', (chunk) => {
        data += chunk
      })

      res.on('end', () => {
        try {
          const json = JSON.parse(data)
          resolve({ status: res.statusCode, data: json })
        } catch (e) {
          resolve({ status: res.statusCode, data: data })
        }
      })
    })

    req.on('error', reject)

    if (body) {
      req.write(JSON.stringify(body))
    }

    req.end()
  })
}

async function createPin(teamName = '') {
  try {
    const response = await makeRequest('POST', '/api/auth/create-session', {
      teamName: teamName || `Team ${Date.now()}`,
    })

    if (response.status !== 200) {
      throw new Error(`API Error: ${response.data.error || 'Unknown error'}`)
    }

    const pin = response.data
    return pin
  } catch (error) {
    throw new Error(`Failed to create PIN: ${error.message}`)
  }
}

async function createMultiplePins(count, teamPrefix = 'Team') {
  const pins = []
  for (let i = 1; i <= count; i++) {
    try {
      const pin = await createPin(`${teamPrefix} ${i}`)
      pins.push(pin)
      log(`✅ PIN ${i}/${count}: ${pin.pin} (${pin.team_name})`, 'green')
    } catch (error) {
      log(`❌ Failed to create PIN ${i}: ${error.message}`, 'red')
    }
  }
  return pins
}

function printPin(pin) {
  console.log(`
╔═══════════════════════════════════╗
║ 📌 NEW PIN CREATED                ║
╚═══════════════════════════════════╝
PIN:       ${colors.cyan}${pin.pin}${colors.reset}
Team:      ${pin.team_name}
ID:        ${pin.id}
Expires:   7 days

👉 Share this PIN with your team via secure channel
  `)
}

function printHelp() {
  log(`
NDMS Admin CLI - PIN Management

Usage:
  node scripts/admin-cli.js <command> [options]

Commands:
  create-pin [teamName]    Create a single PIN
                           Example: create-pin "Urban Search & Rescue"
  
  create-pins <count>      Create multiple PINs
                           Example: create-pins 5
  
  help                     Show this help message

Environment Variables:
  API_URL         API endpoint (default: http://localhost:3000)
  ADMIN_TOKEN     Admin authentication token (required)

Examples:
  # Create single PIN
  ADMIN_TOKEN=my-token node scripts/admin-cli.js create-pin "Team A"
  
  # Create 10 PINs
  ADMIN_TOKEN=my-token node scripts/admin-cli.js create-pins 10
  
  # Create PINs for production
  API_URL=https://ndms-photos-lab.azurewebsites.net \\
  ADMIN_TOKEN=prod-token \\
  node scripts/admin-cli.js create-pins 5
  `, 'cyan')
}

async function main() {
  const args = process.argv.slice(2)

  if (args.length === 0 || args[0] === 'help' || args[0] === '--help') {
    printHelp()
    process.exit(0)
  }

  // Check for admin token
  if (!ADMIN_TOKEN) {
    log('❌ Error: ADMIN_TOKEN environment variable is required', 'red')
    log('Usage: ADMIN_TOKEN=your-token node scripts/admin-cli.js <command>', 'yellow')
    process.exit(1)
  }

  const command = args[0]
  const arg1 = args[1]

  try {
    if (command === 'create-pin') {
      const pin = await createPin(arg1)
      printPin(pin)
      log(`✅ PIN created successfully`, 'green')
    } else if (command === 'create-pins') {
      const count = parseInt(arg1 || '5')
      if (isNaN(count) || count < 1) {
        throw new Error('Count must be a positive number')
      }
      log(`\n📋 Creating ${count} PINs...`, 'blue')
      const pins = await createMultiplePins(count)
      
      log(`\n✅ Successfully created ${pins.length} PINs`, 'green')
      
      // Print summary table
      console.log('\n📊 Summary:')
      console.log('─'.repeat(50))
      console.log('PIN      │ Team')
      console.log('─'.repeat(50))
      pins.forEach((pin) => {
        console.log(`${pin.pin}  │ ${pin.team_name}`)
      })
      console.log('─'.repeat(50))
    } else {
      log(`❌ Unknown command: ${command}`, 'red')
      printHelp()
      process.exit(1)
    }
  } catch (error) {
    log(`❌ Error: ${error.message}`, 'red')
    process.exit(1)
  }
}

main()
