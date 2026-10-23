/**
 * The one environment value the copied production code reads (BffClientService and the
 * client specs): the product API's base. kiosk-web calls one origin (ADR-260 D2): the static
 * server proxies /api/ and /bff/ to chora-gateway, so every path is relative to the page and
 * the base is empty. Production's file carries its cloud URLs; none of them apply here.
 */
export const environment: { readonly bffBaseUrl: string } = { bffBaseUrl: '' };
