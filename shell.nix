{
  pkgs ? import <nixpkgs> { },
}:
pkgs.mkShell {
  packages = with pkgs; [
    sqlite
    nodejs
    vulkan-loader
  ];

  shellHook = ''
    export PATH="$PWD/node_modules/.bin:$PATH"
    export LD_LIBRARY_PATH="${pkgs.lib.makeLibraryPath [ pkgs.vulkan-loader ]}''${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
  '';
}
