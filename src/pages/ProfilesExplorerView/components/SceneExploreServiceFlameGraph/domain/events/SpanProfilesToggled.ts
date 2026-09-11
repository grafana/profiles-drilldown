import { BusEventWithPayload } from '@grafana/data';

interface SpanProfilesToggledPayload {
  enabled: boolean;
}

export class SpanProfilesToggled extends BusEventWithPayload<SpanProfilesToggledPayload> {
  static type = 'span-profiles-toggled';
}
