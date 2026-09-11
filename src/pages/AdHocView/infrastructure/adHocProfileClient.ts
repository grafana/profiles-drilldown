import { t } from '@grafana/i18n';
import { displayWarning } from '@shared/domain/displayStatus';
import { ApiClient } from '@shared/infrastructure/http/ApiClient';

import { AdHocProfile } from '../domain/AdHocProfile';
import { stripBase64Prefix } from './helpers/stripBase64Prefix';
import { prepareAdHocProfileUploadPayload } from './prepareAdHocProfileUploadPayload';

class AdHocProfileClient extends ApiClient {
  async get(profileId: string, profileType: string): Promise<AdHocProfile> {
    const response = await this.fetch('/adhocprofiles.v1.AdHocProfileService/Get', {
      method: 'POST',
      body: JSON.stringify({
        id: profileId,
        profile_type: profileType,
      }),
    });

    const json = await response.json();

    return {
      id: json.id,
      name: json.name,
      profileTypes: json.profileTypes,
      profile: JSON.parse(json.flamebearerProfile),
    };
  }

  async uploadSingle(file: File): Promise<AdHocProfile> {
    const rawProfile = await this._readProfileFile(file);
    const [profile, convertedFromDouble] = prepareAdHocProfileUploadPayload(rawProfile);

    const response = await this.fetch('/adhocprofiles.v1.AdHocProfileService/Upload', {
      method: 'POST',
      body: JSON.stringify({
        name: file.name,
        profile,
      }),
    });

    const json = await response.json();

    if (convertedFromDouble) {
      displayWarning([
        t(
          'ad-hoc.upload.diff-converted-to-single',
          'Diff profile was converted to a single flame graph for upload. Comparison data was not kept.'
        ),
      ]);
    }

    return {
      id: json.id,
      name: file.name,
      profileTypes: json.profileTypes,
      // when the uploaded file contains multiple sample types, the 1st is always returned by the API
      profile: JSON.parse(json.flamebearerProfile),
    };
  }

  async diff(leftId: string, rightId: string, profileType?: string) {
    const response = await this.fetch('/adhocprofiles.v1.AdHocProfileService/Diff', {
      method: 'POST',
      body: JSON.stringify({
        left_id: leftId,
        right_id: rightId,
        ...(profileType && { profile_type: profileType }),
      }),
    });

    const json = await response.json();

    return {
      profileTypes: json.profileTypes as string[],
      profile: JSON.parse(json.flamebearerProfile),
    };
  }

  async _readProfileFile(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const fileReader = new FileReader();

      fileReader.addEventListener('load', () => {
        try {
          resolve(stripBase64Prefix(fileReader.result as string));
        } catch (error) {
          reject(error);
        }
      });

      fileReader.addEventListener('error', (/*event: ProgressEvent<FileReader>*/) => {
        // TODO: upgrade TS lib compiler option to support latest JS features
        // See https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error/cause
        reject(new Error(`Error while reading file "${file.name}"!` /*, { cause: event }*/));
      });

      fileReader.readAsDataURL(file);
    });
  }
}

export function createAdHocProfileClient() {
  return new AdHocProfileClient();
}
