{
  pkgs ? import <nixpkgs> { },
}:
let
  # Keep on the same major version as the `electron` npm package.
  electron = pkgs.electron_43;
in
pkgs.mkShell {
  packages = with pkgs; [
    sqlite
    nodejs
    vulkan-loader
  ];

  # The npm package's prebuilt binary cannot run on NixOS, so its CLI launches this one instead.
  ELECTRON_OVERRIDE_DIST_PATH = "${electron}/bin";

  shellHook = ''
    export PATH="$PWD/node_modules/.bin:$PATH"
    export LD_LIBRARY_PATH="${pkgs.lib.makeLibraryPath [ pkgs.vulkan-loader ]}''${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
  '';
}
