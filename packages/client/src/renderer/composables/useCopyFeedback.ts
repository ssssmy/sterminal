import { ref } from 'vue'

/**
 * Copy text to clipboard with visual feedback (icon swap to checkmark).
 * Usage:
 *   const { copied, copyWithFeedback } = useCopyFeedback()
 *   <el-button @click="copyWithFeedback(text)">
 *     <el-icon><Check v-if="copied" /><CopyDocument v-else /></el-icon>
 *   </el-button>
 */
export function useCopyFeedback(resetDelay = 1500) {
  const copied = ref(false)
  let timer: ReturnType<typeof setTimeout> | null = null

  async function copyWithFeedback(text: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(text)
      copied.value = true
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        copied.value = false
      }, resetDelay)
      return true
    } catch {
      copied.value = false
      return false
    }
  }

  return { copied, copyWithFeedback }
}
