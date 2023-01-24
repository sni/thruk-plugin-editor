use warnings;
use strict;
use Test::More;

BEGIN {
    use lib('t');
    require TestUtils;
    import TestUtils;
}

plan skip_all => 'internal test' if $ENV{'PLACK_TEST_EXTERNALSERVER_URI'};
plan skip_all => 'backends required' if !-s 'thruk_local.conf';
plan tests => 30;

###########################################################
# test modules
unshift @INC, 'plugins/plugins-available/editor/lib';
use_ok 'Thruk::Controller::editor';

###########################################################
# test main page
TestUtils::test_page(
    'url'             => '/thruk/cgi-bin/editor.cgi',
    'like'            => 'Editor',
);

# make sure syntax highlighting works
for my $alias (qw/naemon nagios/) {
    TestUtils::test_page(
        'url'             => '/thruk/plugins/editor/vendor/ace-builds/src-min-noconflict/mode-'.$alias.'.js',
        'like'            => ['TextHighlightRules', 'servicegroup_members', 'NaemonHighlightRules'],
    );
}