import appLogger from '@/utils/logger';
import { type Project } from '@commercetools/platform-sdk';
import { getAppApiRoot } from '@/api/ctpClient';
import { parseError } from '../appErrors';
import {
  ProjectSettingsFetchError,
  ProjectDataUnavailableError,
  AppError,
} from '../appErrors';
import { isDemoMode } from '@/demo/config';

export interface ProjectSettings {
  languages: string[];
  countries: string[];
  currencies: string[];
  name: string;
}

class ProjectSettingsService {
  private projectDataCache: Project | null = null;

  /**
   * Fetches project data from the API.
   * Uses a simple in-memory cache.
   * Throws ProjectSettingsFetchError or ProjectDataUnavailableError on failure.
   */
  public async fetchProjectData(): Promise<Project> {
    if (isDemoMode) {
      return {
        version: 1,
        key: 'senet-demo',
        name: 'Senet Portfolio Demo',
        countries: ['DE', 'US', 'RU'],
        currencies: ['EUR', 'USD', 'RUB'],
        languages: ['en', 'ru'],
        createdAt: '2025-05-01T00:00:00.000Z',
        messages: { enabled: false },
        carts: { deleteDaysAfterLastModification: 30 },
      } as Project;
    }
    if (this.projectDataCache) {
      appLogger.log('ProjectSettingsService: Returning cached project data.');
      return this.projectDataCache;
    }

    appLogger.log('ProjectSettingsService: Fetching project data from API...');
    try {
      const apiRoot = getAppApiRoot();
      const projectResponse = await apiRoot.get().execute();

      if (projectResponse.body) {
        this.projectDataCache = projectResponse.body;
        appLogger.log(
          'ProjectSettingsService: Project data fetched and cached successfully.',
        );
        return this.projectDataCache;
      }
      throw new ProjectDataUnavailableError({
        details: 'Project data body is empty from API response.',
      });
    } catch (error: unknown) {
      appLogger.error(
        'ProjectSettingsService: Failed to fetch project data:',
        error,
      );
      this.projectDataCache = null;
      const parsed = parseError(error);
      if (parsed instanceof AppError) {
        throw new ProjectSettingsFetchError({
          details: parsed.details || parsed.message,
          statusCode: parsed.statusCode,
          errorCode: parsed.errorCode || parsed.errorCode,
        });
      }
      throw new ProjectSettingsFetchError({ details: String(error) });
    }
  }

  /**
   * Gets structured project settings.
   * Relies on fetchProjectData.
   */
  async getProjectSettings(): Promise<ProjectSettings> {
    const projectData = await this.fetchProjectData();
    return {
      languages: projectData.languages || [],
      countries: projectData.countries || [],
      currencies: projectData.currencies || [],
      name: projectData.name || 'Unknown Project',
    };
  }

  public clearProjectCache(): void {
    this.projectDataCache = null;
    appLogger.log('ProjectSettingsService: Project data cache cleared.');
  }
}

export { ProjectSettingsService };
export default new ProjectSettingsService();
