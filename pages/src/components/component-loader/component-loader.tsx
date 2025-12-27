export enum ComponentLoaderStatus {
  PENDING = "PENDING",
  LOADING = "LOADING",
  LOADED = "LOADED",
  ERROR = "ERROR",
}

interface ComponentLoaderProps {
  status: ComponentLoaderStatus;
  loading: React.ReactElement;
  error: React.ReactElement;
  loaded: React.ReactElement;
}

export function ComponentLoader({ status, loading, error, loaded }: ComponentLoaderProps): React.ReactElement {
  switch (status) {
    case ComponentLoaderStatus.PENDING:
    case ComponentLoaderStatus.LOADING: {
      return loading;
    }
    case ComponentLoaderStatus.ERROR: {
      return error;
    }
    case ComponentLoaderStatus.LOADED: {
      return loaded;
    }
  }
}
