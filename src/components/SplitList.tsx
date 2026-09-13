import type { ReactNode } from "react";

type Props = {
  list: ReactNode;
  detail: ReactNode;
};

export function SplitList({ list, detail }: Props) {
  return (
    <div className="split">
      <div className="split__list">{list}</div>
      <div className="split__detail">{detail}</div>
    </div>
  );
}
