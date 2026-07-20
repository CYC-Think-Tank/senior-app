import theme from "./interview-theme.module.css";

export function InterviewShell({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className={theme.shell}>
      <div className={theme.content}>{children}</div>
    </main>
  );
}
