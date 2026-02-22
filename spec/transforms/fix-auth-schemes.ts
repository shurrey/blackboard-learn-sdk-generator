/**
 * Converts basic/bearer security schemes to proper OAuth2 securitySchemes
 * with clientCredentials (2LO) and authorizationCode (3LO) + PKCE flows.
 */
export function fixAuthSchemes(spec: any): any {
  // Replace or add proper OAuth2 security schemes
  if (!spec.components) {
    spec.components = {};
  }
  if (!spec.components.securitySchemes) {
    spec.components.securitySchemes = {};
  }

  spec.components.securitySchemes = {
    bearerAuth: {
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
      description: 'OAuth 2.0 Bearer token obtained from the token endpoint.',
    },
    oauth2_client_credentials: {
      type: 'oauth2',
      description: 'Two-legged OAuth 2.0 (client_credentials grant). Used for application-level access.',
      flows: {
        clientCredentials: {
          tokenUrl: '/learn/api/public/v1/oauth2/token',
          scopes: {},
        },
      },
    },
    oauth2_authorization_code: {
      type: 'oauth2',
      description: 'Three-legged OAuth 2.0 (authorization_code grant with PKCE). Used for user-delegated access.',
      flows: {
        authorizationCode: {
          authorizationUrl: '/learn/api/public/v1/oauth2/authorizationcode',
          tokenUrl: '/learn/api/public/v1/oauth2/token',
          scopes: {},
        },
      },
      'x-pkce': true,
    },
  };

  // Update global security to reference the new schemes
  spec.security = [
    { bearerAuth: [] },
  ];

  // Remove old basic auth references from individual operations
  if (spec.paths) {
    for (const path of Object.values(spec.paths) as any[]) {
      for (const op of Object.values(path) as any[]) {
        if (op && typeof op === 'object' && op.security) {
          op.security = op.security.map((s: any) => {
            if (s.basic || s.BasicAuth) {
              return { bearerAuth: [] };
            }
            return s;
          });
        }
      }
    }
  }

  return spec;
}
