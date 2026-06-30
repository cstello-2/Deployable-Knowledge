{
  pkgs ? import <nixpkgs> { },
}:
pkgs.mkShell {
  packages = with pkgs; [
    sqlite
    nodejs
  ];

  shellHook = ''
    export PATH="$PWD/node_modules/.bin:$PATH"
  '';
}
