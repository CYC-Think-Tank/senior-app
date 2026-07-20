export function InterviewShell({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-3xl text-center">{children}</div>
    </main>
  );
}
