const PATHS: Record<string, string> = {
  search: "M11 4a7 7 0 1 0 4.2 12.6l4.6 4.6 1.4-1.4-4.6-4.6A7 7 0 0 0 11 4Zm0 2a5 5 0 1 1 0 10 5 5 0 0 1 0-10Z",
  library: "M4 4h3v16H4V4Zm5 0h3v16H9V4Zm5.2.6 2.9-.8 4.2 15.5-2.9.8-4.2-15.5Z",
  read: "M3 5c3-1 6-1 9 1 3-2 6-2 9-1v14c-3-1-6-1-9 1-3-2-6-2-9-1V5Zm2 1.5v10c2.3-.4 4.6 0 6 1V7.2C9.6 6.2 7.3 6 5 6.5Zm14 0c-2.3-.5-4.6-.3-6 .7v10.3c1.4-1 3.7-1.4 6-1V6.5Z",
  star: "M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9L12 3.5Z",
  download: "M11 4h2v8.6l3.3-3.3 1.4 1.4L12 16.4l-5.7-5.7 1.4-1.4 3.3 3.3V4ZM5 18h14v2H5v-2Z",
  external: "M14 4h6v6h-2V7.4l-7.3 7.3-1.4-1.4L16.6 6H14V4ZM5 6h6v2H6v10h10v-5h2v6H4V6h1Z",
  refresh: "M12 5a7 7 0 0 1 6.7 5H21l-3.5 4-3.5-4h2.6A5 5 0 1 0 17 14.6l1.6 1.2A7 7 0 1 1 12 5Z",
  panel: "M4 4h16v16H4V4Zm2 2v12h7V6H6Zm9 0v12h3V6h-3Z",
  close: "M6.4 5 12 10.6 17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4L12 13.4 6.4 19 5 17.6 10.6 12 5 6.4 6.4 5Z",
  chevron: "M8.6 6 10 4.6l7.4 7.4-7.4 7.4L8.6 18l6-6-6-6Z",
};

export function Icon({ name, size = 18, className }: { name: keyof typeof PATHS | string; size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
      <path d={PATHS[name]} />
    </svg>
  );
}
