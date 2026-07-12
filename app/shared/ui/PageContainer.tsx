export function PageContainer({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-6xl px-5 sm:px-8 lg:px-10 ${className}`.trim()}>{children}</div>;
}
