import React, { useMemo, useState } from "react";

export function ReactIntegrationCheck(): React.ReactElement {
  const [clicks, setClicks] = useState(0);
  const mountedAt = useMemo(() => new Date().toISOString(), []);

  return (
    <section aria-label="React integration check">
      <p>
        <strong>React island:</strong> mounted at {mountedAt}
      </p>
      <button type="button" onClick={() => setClicks((c) => c + 1)}>
        Clicks: {clicks}
      </button>
    </section>
  );
}
