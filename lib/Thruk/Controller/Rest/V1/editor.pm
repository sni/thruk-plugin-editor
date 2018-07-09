package Thruk::Controller::Rest::V1::editor;

use strict;
use warnings;

=head1 NAME

Thruk::Controller::Rest::V1::editor - Editor Rest interface version 1

=head1 DESCRIPTION

Thruk Controller

=head1 METHODS

=head2 index

=cut

use Thruk::Controller::editor;

##########################################################
sub index {
    my($c, $path_info) = @_;

    my @path_info = split(/\//mx, $path_info);
    return unless($path_info =~ m%^/editor?%mx);
    return unless($c->req->method eq 'GET');

    # REST PATH: GET /editor/files
    # lists editor files and path.
    if($path_info =~ m%^/editor/files?$%mx) {
        return(Thruk::Controller::editor::TO_JSON($c));
    }

    # REST PATH: GET /editor
    # lists editor sections.
    return(Thruk::Controller::editor::TO_JSON($c, 1));
}

=head1 AUTHOR

Sven Nierlein, 2009-present, <sven@nierlein.org>

=head1 LICENSE

This library is free software, you can redistribute it and/or modify
it under the same terms as Perl itself.

=cut

1;
