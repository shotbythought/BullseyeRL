export function FixedStreetViewClue(props: {
  imageUrl: string;
  heading: number;
  pitch: number;
  fov: number;
}) {
  return (
    <div className="overflow-hidden rounded-[2rem] border border-ink/10 bg-slate shadow-panel">
      <div className="flex items-center justify-between border-b border-white/10 px-5 py-3 text-xs font-semibold uppercase tracking-[0.22em] text-white/70">
        <span>Fixed clue</span>
        <span>
          H {Math.round(props.heading)} / P {Math.round(props.pitch)} / FOV{" "}
          {Math.round(props.fov)}
        </span>
      </div>
      <div className="relative aspect-[16/10] bg-ink">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          alt="Street View clue"
          className="h-full w-full object-cover"
          draggable={false}
          src={props.imageUrl}
        />
      </div>
    </div>
  );
}
