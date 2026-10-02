import { t } from '@grafana/i18n';
import { Category, KnownCategory } from '@shared/domain/semantic/jevRubric';

// Keep display copy separate from the model rubric.
const LABELS: Record<Category, () => string> = {
  runtime: () => t('semantic.category.runtime', 'Runtime'),
  networking: () => t('semantic.category.networking', 'Networking'),
  database_client: () => t('semantic.category.database-client', 'Database client'),
  serialization: () => t('semantic.category.serialization', 'Serialization'),
  crypto_compression: () => t('semantic.category.crypto-compression', 'Crypto and compression'),
  io: () => t('semantic.category.io', 'I/O'),
  observability: () => t('semantic.category.observability', 'Observability'),
  standard_library: () => t('semantic.category.standard-library', 'Standard library'),
  application_logic: () => t('semantic.category.application-code', 'Application code'),
  unknown: () => t('semantic.category.unknown', 'Unknown'),
};

const DESCRIPTIONS: Record<KnownCategory, () => string> = {
  runtime: () =>
    t(
      'semantic.category-description.runtime',
      'Language runtime work such as garbage collection, JIT compilation, allocation and scheduling.'
    ),
  networking: () =>
    t(
      'semantic.category-description.networking',
      'HTTP, RPC and other application protocols: servers, clients, routing, middleware and messaging.'
    ),
  database_client: () =>
    t(
      'semantic.category-description.database-client',
      'Database and cache clients: drivers, protocols, ORMs and connection pools.'
    ),
  serialization: () =>
    t('semantic.category-description.serialization', 'Parsing and encoding data formats such as JSON and protobuf.'),
  crypto_compression: () =>
    t(
      'semantic.category-description.crypto-compression',
      'Encryption, hashing, TLS record processing and compression.'
    ),
  io: () => t('semantic.category-description.io', 'Generic socket, file system and operating system I/O.'),
  observability: () =>
    t('semantic.category-description.observability', 'Logging, metrics, tracing and profiling instrumentation.'),
  standard_library: () =>
    t(
      'semantic.category-description.standard-library',
      'General-purpose language and standard library functions, such as date, string and array operations.'
    ),
  application_logic: () =>
    t(
      'semantic.category-description.application-code',
      'Application workflows, orchestration and domain helpers, informed by the application identity.'
    ),
};

export function categoryLabel(category: Category): string {
  return LABELS[category]();
}

export function categoryDescription(category: KnownCategory): string {
  return DESCRIPTIONS[category]();
}
