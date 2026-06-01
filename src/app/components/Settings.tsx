import { useState, useEffect } from 'react';
import { AppSettings } from '../types';
import { api } from '../services/api';
import { Save, Key, Clock, Zap } from 'lucide-react';

interface SettingsProps {
  onThemeChange?: (theme: 'light' | 'dark' | 'system') => void;
}

export function Settings({ onThemeChange }: SettingsProps) {
  const [settings, setSettings] = useState<AppSettings>({
    openRouterApiKey: '',
    openRouterModel: 'openrouter/anthropic/claude-sonnet-4',
    watchInterval: 60,
    theme: 'system'
  });
  const [saved, setSaved] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    const data = await api.getSettings();
    setSettings(data);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    await api.saveSettings(settings);
    if (onThemeChange) {
      onThemeChange(settings.theme);
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleThemeChange = (theme: 'light' | 'dark' | 'system') => {
    setSettings({ ...settings, theme });
    if (onThemeChange) {
      onThemeChange(theme);
    }
  };

  const popularModels = [
    { id: 'openrouter/anthropic/claude-sonnet-4', name: 'Claude Sonnet 4' },
    { id: 'openrouter/anthropic/claude-opus-4', name: 'Claude Opus 4' },
    { id: 'openrouter/openai/gpt-4-turbo', name: 'GPT-4 Turbo' },
    { id: 'openrouter/google/gemini-pro', name: 'Gemini Pro' },
  ];

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="max-w-3xl mx-auto p-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground">Settings</h1>
          <p className="text-muted-foreground mt-1">Configure ownNBLM</p>
        </div>

        <form onSubmit={handleSave} className="space-y-6">
          {/* OpenRouter Configuration */}
          <div className="bg-card rounded-lg shadow-sm border border-border p-6">
            <div className="flex items-center gap-2 mb-4">
              <Key className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              <h2 className="text-lg font-semibold text-foreground">OpenRouter API</h2>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  API Key
                </label>
                <div className="relative">
                  <input
                    type={showApiKey ? 'text' : 'password'}
                    value={settings.openRouterApiKey}
                    onChange={(e) => setSettings({ ...settings, openRouterApiKey: e.target.value })}
                    className="w-full px-3 py-2 border border-input bg-background text-foreground rounded-md focus:outline-none focus:ring-2 focus:ring-ring pr-20"
                    placeholder="sk-or-..."
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
                  >
                    {showApiKey ? 'Hide' : 'Show'}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Get your API key from{' '}
                  <a
                    href="https://openrouter.ai/keys"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    openrouter.ai/keys
                  </a>
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Model
                </label>
                <select
                  value={settings.openRouterModel}
                  onChange={(e) => setSettings({ ...settings, openRouterModel: e.target.value })}
                  className="w-full px-3 py-2 border border-input bg-background text-foreground rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {popularModels.map(model => (
                    <option key={model.id} value={model.id}>
                      {model.name}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground mt-1">
                  Select the LLM model for retrieval and generation
                </p>
              </div>
            </div>
          </div>

          {/* File Watching */}
          <div className="bg-card rounded-lg shadow-sm border border-border p-6">
            <div className="flex items-center gap-2 mb-4">
              <Clock className="w-5 h-5 text-green-600 dark:text-green-400" />
              <h2 className="text-lg font-semibold text-foreground">File Watching</h2>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Polling Interval (seconds)
              </label>
              <input
                type="number"
                min="10"
                max="600"
                value={settings.watchInterval}
                onChange={(e) => setSettings({ ...settings, watchInterval: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border border-input bg-background text-foreground rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <p className="text-xs text-muted-foreground mt-1">
                How often to check for file changes in watched folders (10-600 seconds)
              </p>
            </div>
          </div>

          {/* Appearance */}
          <div className="bg-card rounded-lg shadow-sm border border-border p-6">
            <div className="flex items-center gap-2 mb-4">
              <Zap className="w-5 h-5 text-purple-600 dark:text-purple-400" />
              <h2 className="text-lg font-semibold text-foreground">Appearance</h2>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-3">
                Theme
              </label>
              <div className="grid grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={() => handleThemeChange('light')}
                  className={`p-3 border-2 rounded-lg transition-all ${
                    settings.theme === 'light'
                      ? 'border-blue-600 dark:border-blue-400 bg-blue-50 dark:bg-blue-950'
                      : 'border-border hover:border-muted-foreground'
                  }`}
                >
                  <div className="text-2xl mb-1">☀️</div>
                  <div className="text-sm font-medium text-foreground">Light</div>
                </button>
                <button
                  type="button"
                  onClick={() => handleThemeChange('dark')}
                  className={`p-3 border-2 rounded-lg transition-all ${
                    settings.theme === 'dark'
                      ? 'border-blue-600 dark:border-blue-400 bg-blue-50 dark:bg-blue-950'
                      : 'border-border hover:border-muted-foreground'
                  }`}
                >
                  <div className="text-2xl mb-1">🌙</div>
                  <div className="text-sm font-medium text-foreground">Dark</div>
                </button>
                <button
                  type="button"
                  onClick={() => handleThemeChange('system')}
                  className={`p-3 border-2 rounded-lg transition-all ${
                    settings.theme === 'system'
                      ? 'border-blue-600 dark:border-blue-400 bg-blue-50 dark:bg-blue-950'
                      : 'border-border hover:border-muted-foreground'
                  }`}
                >
                  <div className="text-2xl mb-1">💻</div>
                  <div className="text-sm font-medium text-foreground">System</div>
                </button>
              </div>
            </div>
          </div>

          {/* Save Button */}
          <div className="flex justify-end">
            <button
              type="submit"
              className="px-6 py-2 bg-blue-600 dark:bg-blue-700 text-white rounded-md hover:bg-blue-700 dark:hover:bg-blue-600 transition-colors flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              {saved ? 'Saved!' : 'Save Settings'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
