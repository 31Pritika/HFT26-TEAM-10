import type { ReactNode } from "react";

/** The one width every /app page sits in. `w-full` keeps it from shrinking to its content. */
export function PageContainer({ children }: { children: ReactNode }) {
  return <div className="flex w-full max-w-[1600px] flex-1 flex-col mx-auto">{children}</div>;
}
