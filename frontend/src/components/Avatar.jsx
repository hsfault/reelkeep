import { useState } from "react";

export default function Avatar({ src, name, size = 40 }) {
  const [failed, setFailed] = useState(false);
  const letter = (name || "?").charAt(0).toUpperCase();

  return (
    <span
      className="grid shrink-0 place-items-center overflow-hidden rounded-full bg-hairline font-display font-semibold text-muted"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {src && !failed ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          onError={() => setFailed(true)}
          className="size-full object-cover"
        />
      ) : (
        letter
      )}
    </span>
  );
}