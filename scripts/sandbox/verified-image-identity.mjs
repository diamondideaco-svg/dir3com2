// Legacy Docker exposes the config digest as Id. The containerd image store
// exposes the target manifest digest instead, with its OCI Descriptor.
// https://github.com/moby/moby/blob/12fdfe2cfc44f0de4dc06c878c39b0b0fd7d6324/daemon/containerd/image_inspect.go
export function imageIdentityChecks(entry, { manifestDigest, configDigest, repositories }) {
  return {
    os: entry?.Os === 'linux', architecture: entry?.Architecture === 'amd64',
    repositoryDigest: Array.isArray(entry?.RepoDigests) && entry.RepoDigests.some((digest) =>
      repositories.some((repository) => digest === repository + '@' + manifestDigest)),
    configId: entry?.Id === configDigest, manifestId: entry?.Id === manifestDigest,
    descriptorDigest: entry?.Descriptor?.digest === manifestDigest,
    singleManifest: ['application/vnd.oci.image.manifest.v1+json', 'application/vnd.docker.distribution.manifest.v2+json'].includes(entry?.Descriptor?.mediaType),
  };
}

export function verifiedImageIdentity(entry, approved) {
  const checks = imageIdentityChecks(entry, approved);
  if (!checks.os || !checks.architecture || !checks.repositoryDigest) return null;
  if (checks.configId) return 'config-digest';
  // The exact approved manifest commits to its config AND layer digests. This
  // accepts that same immutable identity, not an arbitrary new image Id/index.
  if (checks.manifestId && checks.descriptorDigest && checks.singleManifest) return 'manifest-digest';
  return null;
}
