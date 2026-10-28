import { Switch } from '@/components/ui/switch';
import { updateProtection } from '@/protection/topics';

/**
 * The blur-all-thumbnails switch: a stopgap for spoilers that are only in a
 * picture, which no Related Term can catch. Open pages follow it straight away.
 */
export function BlurThumbnailsSwitch({ on, description }: { on: boolean; description: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex flex-col gap-1">
        <span className="leading-none font-medium">Blur all YouTube thumbnails</span>
        <span className="text-muted-foreground text-[13px] leading-normal">{description}</span>
      </div>
      <Switch
        checked={on}
        onCheckedChange={(checked) => updateProtection((state) => ({ ...state, blurAllThumbnails: checked }))}
        aria-label="Blur all YouTube thumbnails"
      />
    </div>
  );
}
