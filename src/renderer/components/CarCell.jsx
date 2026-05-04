export default function CarCell({ name, imageUrl, carClass }) {
  return (
    <div className="flex items-center gap-3">
      {imageUrl ? (
        <img
          src={imageUrl}
          alt=""
          className="w-7 h-7 object-cover border hairline shrink-0"
        />
      ) : null}
      <span>
        {name}
        {carClass ? <span className="text-muted ml-2">[{carClass}]</span> : null}
      </span>
    </div>
  );
}
