christmasTree.initTree(TreeType.PCB, 200, true)

// Test TwinkleFOX engine & palettes
christmasTree.renderTwinkleTreeAt(15350, TreePalette.Holly, TreePalette.FairyLight, 4, 6, christmasTree.treeColor(TreeColor.BgDarkGreen))

// Test palette interpolation & VirtualSegment direct pixel addressing
const iceTip = christmasTree.colorFromPalette(TreePalette.Ice, 220, 255, true)
christmasTree.setVirtualSegmentPixel(VirtualTreeSegment.StarOuter, 2, iceTip)

// Test read-modify-write on shadow buffer + fadeAll + distance LUT
const tipColor = christmasTree.getPixel(55)
if (tipColor == 0) {
    christmasTree.setPixel(55, 0xffffff)
}
const distLut = christmasTree.buildEpicenterDistanceLut(TreeEpicenter.Star)
if (distLut.length == 60) {
    christmasTree.show()
}
