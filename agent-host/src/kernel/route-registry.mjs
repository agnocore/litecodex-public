export function createRouteRegistry() {
  const exactRoutes = new Map();
  const patternRoutes = [];

  function key(method, path) {
    return `${String(method || "GET").toUpperCase()} ${String(path || "")}`;
  }

  function addRoute(definition) {
    const method = String(definition?.method || "GET").toUpperCase();
    const source = String(definition?.source || "community");
    const capability = definition?.capability ? String(definition.capability) : null;
    const route = {
      method,
      source,
      capability,
      handler: definition?.handler,
      path: definition?.path || null,
      pattern: definition?.pattern || null,
      meta: definition?.meta || {}
    };
    if (route.path) {
      exactRoutes.set(key(method, route.path), route);
      return route;
    }
    if (!(route.pattern instanceof RegExp)) {
      throw new Error("route_pattern_required_for_non_exact_route");
    }
    patternRoutes.push(route);
    return route;
  }

  function matchRoute(method, pathname) {
    const m = String(method || "GET").toUpperCase();
    const p = String(pathname || "");
    const exact = exactRoutes.get(key(m, p)) || exactRoutes.get(key("ANY", p));
    if (exact) {
      return {
        route: exact,
        params: {}
      };
    }

    for (const route of patternRoutes) {
      if (route.method !== "ANY" && route.method !== m) {
        continue;
      }
      const found = p.match(route.pattern);
      if (!found) {
        continue;
      }
      return {
        route,
        params: found.groups || {},
        match: found
      };
    }

    return null;
  }

  return {
    addRoute,
    matchRoute,
    listRoutes() {
      return [...exactRoutes.values(), ...patternRoutes];
    }
  };
}
