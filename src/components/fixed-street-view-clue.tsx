export function FixedStreetViewClue(props: { imageUrl: string }) {
  return (
    <div className="overflow-hidden rounded-[2rem] border border-ink/10 bg-slate shadow-panel">
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
