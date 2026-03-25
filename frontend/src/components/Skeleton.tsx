interface SkeletonProps {
  width?: string;
  height?: number;
  className?: string;
}

export const Skeleton = ({ width = "100%", height = 16, className = "" }: SkeletonProps) => {
  return <div className={`skeleton ${className}`.trim()} style={{ width, height }} aria-hidden="true" />;
};
