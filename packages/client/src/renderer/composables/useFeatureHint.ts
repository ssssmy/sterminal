import { ref, onMounted } from 'vue'
import { useSettingsStore } from '@/stores/settings.store'

/**
 * Show a hint once for a feature, then never again.
 * Usage: const { showHint, dismissHint } = useFeatureHint('commandPalette')
 */
export function useFeatureHint(featureId: string) {
  const showHint = ref(false)
  const settingsStore = useSettingsStore()
  const key = `app.hints.${featureId}`

  onMounted(async () => {
    const seen = await settingsStore.getSetting<boolean>(key)
    if (!seen) {
      showHint.value = true
    }
  })

  function dismissHint() {
    showHint.value = false
    settingsStore.setSetting(key, true)
  }

  return { showHint, dismissHint }
}
