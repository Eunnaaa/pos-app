import { AiAssistant } from "@/components/kasir/ai-assistant"
import { AiInsightsPanel } from "@/components/kasir/ai-insights-panel"

export default function AiPage() {
  return (
    <div className="flex flex-1 flex-col gap-8">
      <AiInsightsPanel />
      <AiAssistant />
    </div>
  )
}
