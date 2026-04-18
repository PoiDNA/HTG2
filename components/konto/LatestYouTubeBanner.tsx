interface LatestYouTubeBannerProps {
  youtubeId: string;
  thumbnailUrl: string;
}

export default function LatestYouTubeBanner({ youtubeId, thumbnailUrl }: LatestYouTubeBannerProps) {
  const ytUrl = `https://www.youtube.com/watch?v=${youtubeId}`;

  return (
    <a
      href={ytUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="block rounded-xl overflow-hidden group w-full h-full min-h-[160px] relative"
    >
      <img
        src={thumbnailUrl}
        alt=""
        className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
      />
    </a>
  );
}
