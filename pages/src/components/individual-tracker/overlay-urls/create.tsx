import { useEffect, useMemo, useSyncExternalStore } from "react";
import type { ReactElement } from "react";
import { OverlayUrlsPresenter } from "./overlay-urls-presenter";
import { OverlayUrlsSection } from "./overlay-urls";
import { OverlayUrlsStore } from "./overlay-urls-store";
import type { OverlayUrlsSectionProps } from "./types";

export function createOverlayUrlsSection(): (props: OverlayUrlsSectionProps) => ReactElement {
  return function OverlayUrlsSectionContainer(props: OverlayUrlsSectionProps): ReactElement {
    const store = useMemo(() => new OverlayUrlsStore(), []);
    const presenter = useMemo(() => new OverlayUrlsPresenter({ store }), [store]);

    useEffect(() => (): void => presenter.dispose(), [presenter]);

    const snapshot = useSyncExternalStore(
      (listener) => store.subscribe(listener),
      () => store.getSnapshot(),
      () => store.getSnapshot(),
    );
    const viewModel = presenter.present(props, snapshot);

    return (
      <OverlayUrlsSection
        {...props}
        {...viewModel}
        onCopy={(target, url): void => {
          presenter.copy(target, url);
        }}
        onOpen={(url): void => {
          presenter.open(url);
        }}
      />
    );
  };
}
