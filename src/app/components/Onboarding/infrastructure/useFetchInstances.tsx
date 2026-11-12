import { callAppPluginProxy } from '@grafana/plugin-compat/apps';
import { useQuery } from '@tanstack/react-query';
import { PYROSCOPE_APP_ID } from 'src/constants';

type ProxyResponse = { orgSlug?: string; hpInstanceId?: number };

export function useFetchInstances(enabled = true) {
  const { isFetching, error, data } = useQuery({
    enabled,
    queryKey: ['instances'],
    queryFn: () =>
      callAppPluginProxy<ProxyResponse>({ pluginId: PYROSCOPE_APP_ID, routePath: 'grafanacom-api/instances' }),
  });

  return {
    isFetching,
    error,
    instances: data,
  };
}
