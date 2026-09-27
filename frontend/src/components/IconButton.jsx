import { Link } from "react-router-dom";

const base =
  "grid size-11 place-items-center rounded-full text-ink transition-[transform,background-color] duration-150 hover:bg-black/5 active:scale-90 active:bg-black/[0.07]";

export default function IconButton({ to, label, className = "", children, ...props }) {
  if (to) {
    return (
      <Link to={to} aria-label={label} className={`${base} ${className}`}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" aria-label={label} className={`${base} ${className}`} {...props}>
      {children}
    </button>
  );
}