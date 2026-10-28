import { BlurThumbnailsSwitch } from '@/components/blur-thumbnails-switch';

/** How protected sites look while Blackout runs. */
export function DisplaySettings({ blurAllThumbnails }: { blurAllThumbnails: boolean }) {
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <h1 className="text-2xl leading-tight font-semibold tracking-tight">Display</h1>
        <p className="text-muted-foreground leading-normal">
          How protected sites look while Blackout runs.
        </p>
      </div>

      <section className="bg-card flex flex-col gap-4 rounded-2xl border p-6">
        <BlurThumbnailsSwitch
          on={blurAllThumbnails}
          description="Blackout reads titles and text, not pictures. Around a launch, blur every thumbnail so a spoiler that is only in the picture can't reach you."
        />
      </section>
    </>
  );
}
