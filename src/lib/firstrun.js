/**
 * First-run detection and onboarding trigger for Pulse CLI.
 *
 * @module lib/firstrun
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { PreferencesStore } = require('./config-store');

/**
 * Check if Pulse CLI has been configured (has .env with content).
 * @returns {boolean}
 */
function hasEnvConfig() {
  const envLocations = [
    path.join(process.cwd(), '.env'),
    path.join(os.homedir(), '.pulse', '.env'),
  ];
  for (const loc of envLocations) {
    if (fs.existsSync(loc)) {
      try {
        const content = fs.readFileSync(loc, 'utf-8').trim();
        if (content && content.includes('API_KEY=')) return true;
      } catch { /* ignore */ }
    }
  }
  return false;
}

/**
 * Check if any provider is configured in providers.json.
 * @returns {boolean}
 */
function hasProviders() {
  const providersPath = path.join(os.homedir(), '.pulse', 'providers.json');
  if (!fs.existsSync(providersPath)) return false;
  try {
    const data = JSON.parse(fs.readFileSync(providersPath, 'utf-8'));
    return Boolean(data.providers && Object.keys(data.providers).length > 0);
  } catch {
    return false;
  }
}

/**
 * Check if this is a first run.
 * "First run" means no existing configuration was found.
 * @returns {boolean}
 */
function isFirstRun() {
  return !hasEnvConfig() && !hasProviders();
}

/**
 * Check and handle first-run state.
 * Returns true if it's the first run (caller may want to start onboarding).
 * @param {object} [options]
 * @param {boolean} [options.force=false]
 * @returns {Promise<boolean>}
 */
async function checkFirstRun(options = {}) {
  if (!options.force && !isFirstRun()) return false;

  // Mark first-run as complete (prevents showing again)
  const prefs = new PreferencesStore();
  prefs.completeFirstRun();

  return true;
}

module.exports = { checkFirstRun, hasEnvConfig, hasProviders, isFirstRun };
